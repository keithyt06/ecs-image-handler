"use strict";
/* -*- tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- /
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/*
   Copyright 2011 notmasteryet

   Licensed under the Apache License, Version 2.0 (the "License");
   you may not use this file except in compliance with the License.
   You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
// - The JPEG specification can be found in the ITU CCITT Recommendation T.81
//   (www.w3.org/Graphics/JPEG/itu-t81.pdf)
// - The JFIF specification can be found in the JPEG File Interchange Format
//   (www.w3.org/Graphics/JPEG/jfif3.pdf)
// - The Adobe Application-Specific JPEG markers in the Supporting the DCT Filters
//   in PostScript Level 2, Technical Note #5116
//   (partners.adobe.com/public/developer/en/ps/sdk/5116.DCT_Filter.pdf)
const dctZigZag = new Int32Array([
    0,
    1, 8,
    16, 9, 2,
    3, 10, 17, 24,
    32, 25, 18, 11, 4,
    5, 12, 19, 26, 33, 40,
    48, 41, 34, 27, 20, 13, 6,
    7, 14, 21, 28, 35, 42, 49, 56,
    57, 50, 43, 36, 29, 22, 15,
    23, 30, 37, 44, 51, 58,
    59, 52, 45, 38, 31,
    39, 46, 53, 60,
    61, 54, 47,
    55, 62,
    63
]);
const dctCos1 = 4017; // cos(pi/16)
const dctSin1 = 799; // sin(pi/16)
const dctCos3 = 3406; // cos(3*pi/16)
const dctSin3 = 2276; // sin(3*pi/16)
const dctCos6 = 1567; // cos(6*pi/16)
const dctSin6 = 3784; // sin(6*pi/16)
const dctSqrt2 = 5793; // sqrt(2)
const dctSqrt1d2 = 2896; // sqrt(2) / 2
function buildHuffmanTable(codeLengths, values) {
    var k = 0, code = [], i, j, length = 16;
    while (length > 0 && !codeLengths[length - 1])
        length--;
    code.push({ children: [], index: 0 });
    var p = code[0], q;
    for (i = 0; i < length; i++) {
        for (j = 0; j < codeLengths[i]; j++) {
            p = code.pop();
            p.children[p.index] = values[k];
            while (p.index > 0) {
                if (code.length === 0)
                    throw new Error('Could not recreate Huffman Table');
                p = code.pop();
            }
            p.index++;
            code.push(p);
            while (code.length <= i) {
                code.push(q = { children: [], index: 0 });
                p.children[p.index] = q.children;
                p = q;
            }
            k++;
        }
        if (i + 1 < length) {
            // p here points to last code
            code.push(q = { children: [], index: 0 });
            p.children[p.index] = q.children;
            p = q;
        }
    }
    return code[0].children;
}
function decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successivePrev, successive, opts) {
    var precision = frame.precision;
    var samplesPerLine = frame.samplesPerLine;
    var scanLines = frame.scanLines;
    var mcusPerLine = frame.mcusPerLine;
    var progressive = frame.progressive;
    var maxH = frame.maxH, maxV = frame.maxV;
    var startOffset = offset, bitsData = 0, bitsCount = 0;
    function readBit() {
        if (bitsCount > 0) {
            bitsCount--;
            return (bitsData >> bitsCount) & 1;
        }
        bitsData = data[offset++];
        if (bitsData == 0xFF) {
            var nextByte = data[offset++];
            if (nextByte) {
                throw new Error("unexpected marker: " + ((bitsData << 8) | nextByte).toString(16));
            }
            // unstuff 0
        }
        bitsCount = 7;
        return bitsData >>> 7;
    }
    function decodeHuffman(tree) {
        var node = tree, bit;
        while ((bit = readBit()) !== null) {
            node = node[bit];
            if (typeof node === 'number')
                return node;
            if (typeof node !== 'object')
                throw new Error("invalid huffman sequence");
        }
        return null;
    }
    function receive(length) {
        var n = 0;
        while (length > 0) {
            var bit = readBit();
            if (bit === null)
                return;
            n = (n << 1) | bit;
            length--;
        }
        return n;
    }
    function receiveAndExtend(length) {
        var n = receive(length);
        if (n >= 1 << (length - 1))
            return n;
        return n + (-1 << length) + 1;
    }
    function decodeBaseline(component, zz) {
        var t = decodeHuffman(component.huffmanTableDC);
        var diff = t === 0 ? 0 : receiveAndExtend(t);
        zz[0] = (component.pred += diff);
        var k = 1;
        while (k < 64) {
            var rs = decodeHuffman(component.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
                if (r < 15)
                    break;
                k += 16;
                continue;
            }
            k += r;
            var z = dctZigZag[k];
            zz[z] = receiveAndExtend(s);
            k++;
        }
    }
    function decodeDCFirst(component, zz) {
        var t = decodeHuffman(component.huffmanTableDC);
        var diff = t === 0 ? 0 : (receiveAndExtend(t) << successive);
        zz[0] = (component.pred += diff);
    }
    function decodeDCSuccessive(component, zz) {
        zz[0] |= readBit() << successive;
    }
    var eobrun = 0;
    function decodeACFirst(component, zz) {
        if (eobrun > 0) {
            eobrun--;
            return;
        }
        var k = spectralStart, e = spectralEnd;
        while (k <= e) {
            var rs = decodeHuffman(component.huffmanTableAC);
            var s = rs & 15, r = rs >> 4;
            if (s === 0) {
                if (r < 15) {
                    eobrun = receive(r) + (1 << r) - 1;
                    break;
                }
                k += 16;
                continue;
            }
            k += r;
            var z = dctZigZag[k];
            zz[z] = receiveAndExtend(s) * (1 << successive);
            k++;
        }
    }
    var successiveACState = 0, successiveACNextValue;
    function decodeACSuccessive(component, zz) {
        var k = spectralStart, e = spectralEnd, r = 0;
        while (k <= e) {
            var z = dctZigZag[k];
            var direction = zz[z] < 0 ? -1 : 1;
            switch (successiveACState) {
                case 0: // initial state
                    var rs = decodeHuffman(component.huffmanTableAC);
                    var s = rs & 15, r = rs >> 4;
                    if (s === 0) {
                        if (r < 15) {
                            eobrun = receive(r) + (1 << r);
                            successiveACState = 4;
                        }
                        else {
                            r = 16;
                            successiveACState = 1;
                        }
                    }
                    else {
                        if (s !== 1)
                            throw new Error("invalid ACn encoding");
                        successiveACNextValue = receiveAndExtend(s);
                        successiveACState = r ? 2 : 3;
                    }
                    continue;
                case 1: // skipping r zero items
                case 2:
                    if (zz[z])
                        zz[z] += (readBit() << successive) * direction;
                    else {
                        r--;
                        if (r === 0)
                            successiveACState = successiveACState == 2 ? 3 : 0;
                    }
                    break;
                case 3: // set value for a zero item
                    if (zz[z])
                        zz[z] += (readBit() << successive) * direction;
                    else {
                        zz[z] = successiveACNextValue << successive;
                        successiveACState = 0;
                    }
                    break;
                case 4: // eob
                    if (zz[z])
                        zz[z] += (readBit() << successive) * direction;
                    break;
            }
            k++;
        }
        if (successiveACState === 4) {
            eobrun--;
            if (eobrun === 0)
                successiveACState = 0;
        }
    }
    function decodeMcu(component, decode, mcu, row, col) {
        var mcuRow = (mcu / mcusPerLine) | 0;
        var mcuCol = mcu % mcusPerLine;
        var blockRow = mcuRow * component.v + row;
        var blockCol = mcuCol * component.h + col;
        // If the block is missing and we're in tolerant mode, just skip it.
        if (component.blocks[blockRow] === undefined && opts.tolerantDecoding)
            return;
        decode(component, component.blocks[blockRow][blockCol]);
    }
    function decodeBlock(component, decode, mcu) {
        var blockRow = (mcu / component.blocksPerLine) | 0;
        var blockCol = mcu % component.blocksPerLine;
        // If the block is missing and we're in tolerant mode, just skip it.
        if (component.blocks[blockRow] === undefined && opts.tolerantDecoding)
            return;
        decode(component, component.blocks[blockRow][blockCol]);
    }
    var componentsLength = components.length;
    var component, i, j, k, n;
    var decodeFn;
    if (progressive) {
        if (spectralStart === 0)
            decodeFn = successivePrev === 0 ? decodeDCFirst : decodeDCSuccessive;
        else
            decodeFn = successivePrev === 0 ? decodeACFirst : decodeACSuccessive;
    }
    else {
        decodeFn = decodeBaseline;
    }
    var mcu = 0, marker;
    var mcuExpected;
    if (componentsLength == 1) {
        mcuExpected = components[0].blocksPerLine * components[0].blocksPerColumn;
    }
    else {
        mcuExpected = mcusPerLine * frame.mcusPerColumn;
    }
    if (!resetInterval)
        resetInterval = mcuExpected;
    var h, v;
    while (mcu < mcuExpected) {
        // reset interval stuff
        for (i = 0; i < componentsLength; i++)
            components[i].pred = 0;
        eobrun = 0;
        if (componentsLength == 1) {
            component = components[0];
            for (n = 0; n < resetInterval; n++) {
                decodeBlock(component, decodeFn, mcu);
                mcu++;
            }
        }
        else {
            for (n = 0; n < resetInterval; n++) {
                for (i = 0; i < componentsLength; i++) {
                    component = components[i];
                    h = component.h;
                    v = component.v;
                    for (j = 0; j < v; j++) {
                        for (k = 0; k < h; k++) {
                            decodeMcu(component, decodeFn, mcu, j, k);
                        }
                    }
                }
                mcu++;
                // If we've reached our expected MCU's, stop decoding
                if (mcu === mcuExpected)
                    break;
            }
        }
        if (mcu === mcuExpected) {
            // Skip trailing bytes at the end of the scan - until we reach the next marker
            do {
                if (data[offset] === 0xFF) {
                    if (data[offset + 1] !== 0x00) {
                        break;
                    }
                }
                offset += 1;
            } while (offset < data.length - 2);
        }
        // find marker
        bitsCount = 0;
        marker = (data[offset] << 8) | data[offset + 1];
        if (marker < 0xFF00) {
            throw new Error("marker was not found");
        }
        if (marker >= 0xFFD0 && marker <= 0xFFD7) { // RSTx
            offset += 2;
        }
        else
            break;
    }
    return offset - startOffset;
}
function buildComponentData(frame, component) {
    var lines = [];
    var blocksPerLine = component.blocksPerLine;
    var blocksPerColumn = component.blocksPerColumn;
    var samplesPerLine = blocksPerLine << 3;
    // Only 1 used per invocation of this function and garbage collected after invocation, so no need to account for its memory footprint.
    var R = new Int32Array(64), r = new Uint8Array(64);
    // A port of poppler's IDCT method which in turn is taken from:
    //   Christoph Loeffler, Adriaan Ligtenberg, George S. Moschytz,
    //   "Practical Fast 1-D DCT Algorithms with 11 Multiplications",
    //   IEEE Intl. Conf. on Acoustics, Speech & Signal Processing, 1989,
    //   988-991.
    function quantizeAndInverse(zz, dataOut, dataIn) {
        var qt = component.quantizationTable;
        var v0, v1, v2, v3, v4, v5, v6, v7, t;
        var p = dataIn;
        var i;
        // dequant
        for (i = 0; i < 64; i++)
            p[i] = zz[i] * qt[i];
        // inverse DCT on rows
        for (i = 0; i < 8; ++i) {
            var row = 8 * i;
            // check for all-zero AC coefficients
            if (p[1 + row] == 0 && p[2 + row] == 0 && p[3 + row] == 0 &&
                p[4 + row] == 0 && p[5 + row] == 0 && p[6 + row] == 0 &&
                p[7 + row] == 0) {
                t = (dctSqrt2 * p[0 + row] + 512) >> 10;
                p[0 + row] = t;
                p[1 + row] = t;
                p[2 + row] = t;
                p[3 + row] = t;
                p[4 + row] = t;
                p[5 + row] = t;
                p[6 + row] = t;
                p[7 + row] = t;
                continue;
            }
            // stage 4
            v0 = (dctSqrt2 * p[0 + row] + 128) >> 8;
            v1 = (dctSqrt2 * p[4 + row] + 128) >> 8;
            v2 = p[2 + row];
            v3 = p[6 + row];
            v4 = (dctSqrt1d2 * (p[1 + row] - p[7 + row]) + 128) >> 8;
            v7 = (dctSqrt1d2 * (p[1 + row] + p[7 + row]) + 128) >> 8;
            v5 = p[3 + row] << 4;
            v6 = p[5 + row] << 4;
            // stage 3
            t = (v0 - v1 + 1) >> 1;
            v0 = (v0 + v1 + 1) >> 1;
            v1 = t;
            t = (v2 * dctSin6 + v3 * dctCos6 + 128) >> 8;
            v2 = (v2 * dctCos6 - v3 * dctSin6 + 128) >> 8;
            v3 = t;
            t = (v4 - v6 + 1) >> 1;
            v4 = (v4 + v6 + 1) >> 1;
            v6 = t;
            t = (v7 + v5 + 1) >> 1;
            v5 = (v7 - v5 + 1) >> 1;
            v7 = t;
            // stage 2
            t = (v0 - v3 + 1) >> 1;
            v0 = (v0 + v3 + 1) >> 1;
            v3 = t;
            t = (v1 - v2 + 1) >> 1;
            v1 = (v1 + v2 + 1) >> 1;
            v2 = t;
            t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
            v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
            v7 = t;
            t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
            v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
            v6 = t;
            // stage 1
            p[0 + row] = v0 + v7;
            p[7 + row] = v0 - v7;
            p[1 + row] = v1 + v6;
            p[6 + row] = v1 - v6;
            p[2 + row] = v2 + v5;
            p[5 + row] = v2 - v5;
            p[3 + row] = v3 + v4;
            p[4 + row] = v3 - v4;
        }
        // inverse DCT on columns
        for (i = 0; i < 8; ++i) {
            var col = i;
            // check for all-zero AC coefficients
            if (p[1 * 8 + col] == 0 && p[2 * 8 + col] == 0 && p[3 * 8 + col] == 0 &&
                p[4 * 8 + col] == 0 && p[5 * 8 + col] == 0 && p[6 * 8 + col] == 0 &&
                p[7 * 8 + col] == 0) {
                t = (dctSqrt2 * dataIn[i + 0] + 8192) >> 14;
                p[0 * 8 + col] = t;
                p[1 * 8 + col] = t;
                p[2 * 8 + col] = t;
                p[3 * 8 + col] = t;
                p[4 * 8 + col] = t;
                p[5 * 8 + col] = t;
                p[6 * 8 + col] = t;
                p[7 * 8 + col] = t;
                continue;
            }
            // stage 4
            v0 = (dctSqrt2 * p[0 * 8 + col] + 2048) >> 12;
            v1 = (dctSqrt2 * p[4 * 8 + col] + 2048) >> 12;
            v2 = p[2 * 8 + col];
            v3 = p[6 * 8 + col];
            v4 = (dctSqrt1d2 * (p[1 * 8 + col] - p[7 * 8 + col]) + 2048) >> 12;
            v7 = (dctSqrt1d2 * (p[1 * 8 + col] + p[7 * 8 + col]) + 2048) >> 12;
            v5 = p[3 * 8 + col];
            v6 = p[5 * 8 + col];
            // stage 3
            t = (v0 - v1 + 1) >> 1;
            v0 = (v0 + v1 + 1) >> 1;
            v1 = t;
            t = (v2 * dctSin6 + v3 * dctCos6 + 2048) >> 12;
            v2 = (v2 * dctCos6 - v3 * dctSin6 + 2048) >> 12;
            v3 = t;
            t = (v4 - v6 + 1) >> 1;
            v4 = (v4 + v6 + 1) >> 1;
            v6 = t;
            t = (v7 + v5 + 1) >> 1;
            v5 = (v7 - v5 + 1) >> 1;
            v7 = t;
            // stage 2
            t = (v0 - v3 + 1) >> 1;
            v0 = (v0 + v3 + 1) >> 1;
            v3 = t;
            t = (v1 - v2 + 1) >> 1;
            v1 = (v1 + v2 + 1) >> 1;
            v2 = t;
            t = (v4 * dctSin3 + v7 * dctCos3 + 2048) >> 12;
            v4 = (v4 * dctCos3 - v7 * dctSin3 + 2048) >> 12;
            v7 = t;
            t = (v5 * dctSin1 + v6 * dctCos1 + 2048) >> 12;
            v5 = (v5 * dctCos1 - v6 * dctSin1 + 2048) >> 12;
            v6 = t;
            // stage 1
            p[0 * 8 + col] = v0 + v7;
            p[7 * 8 + col] = v0 - v7;
            p[1 * 8 + col] = v1 + v6;
            p[6 * 8 + col] = v1 - v6;
            p[2 * 8 + col] = v2 + v5;
            p[5 * 8 + col] = v2 - v5;
            p[3 * 8 + col] = v3 + v4;
            p[4 * 8 + col] = v3 - v4;
        }
        // convert to 8-bit integers
        for (i = 0; i < 64; ++i) {
            var sample = 128 + ((p[i] + 8) >> 4);
            dataOut[i] = sample < 0 ? 0 : sample > 0xFF ? 0xFF : sample;
        }
    }
    JpegImage.requestMemoryAllocation(samplesPerLine * blocksPerColumn * 8);
    var i, j;
    for (var blockRow = 0; blockRow < blocksPerColumn; blockRow++) {
        var scanLine = blockRow << 3;
        for (i = 0; i < 8; i++)
            lines.push(new Uint8Array(samplesPerLine));
        for (var blockCol = 0; blockCol < blocksPerLine; blockCol++) {
            quantizeAndInverse(component.blocks[blockRow][blockCol], r, R);
            var offset = 0, sample = blockCol << 3;
            for (j = 0; j < 8; j++) {
                var line = lines[scanLine + j];
                for (i = 0; i < 8; i++)
                    line[sample + i] = r[offset++];
            }
        }
    }
    return lines;
}
function clampTo8bit(a) {
    return a < 0 ? 0 : a > 255 ? 255 : a;
}
class JpegImage {
    static requestMemoryAllocation(increaseAmount = 0) {
        var totalMemoryImpactBytes = JpegImage.totalBytesAllocated + increaseAmount;
        if (totalMemoryImpactBytes > JpegImage.maxMemoryUsageBytes) {
            var exceededAmount = Math.ceil((totalMemoryImpactBytes - JpegImage.maxMemoryUsageBytes) / 1024 / 1024);
            throw new Error(`maxMemoryUsageInMB limit exceeded by at least ${exceededAmount}MB`);
        }
        JpegImage.totalBytesAllocated = totalMemoryImpactBytes;
    }
    static resetMaxMemoryUsage(maxMemoryUsageBytes_) {
        JpegImage.totalBytesAllocated = 0;
        JpegImage.maxMemoryUsageBytes = maxMemoryUsageBytes_;
    }
    ;
    static getBytesAllocated() {
        return JpegImage.totalBytesAllocated;
    }
    ;
    constructor() {
        this.opts = {};
        this.quality = 0;
    }
    parse(data) {
        var maxResolutionInPixels = this.opts.maxResolutionInMP * 1000 * 1000;
        var offset = 0, length = data.length;
        function readUint16() {
            var value = (data[offset] << 8) | data[offset + 1];
            offset += 2;
            return value;
        }
        function readDataBlock() {
            var length = readUint16();
            var array = data.subarray(offset, offset + length - 2);
            offset += array.length;
            return array;
        }
        function prepareComponents(frame) {
            var maxH = 0, maxV = 0;
            var component, componentId;
            for (componentId in frame.components) {
                if (frame.components.hasOwnProperty(componentId)) {
                    component = frame.components[componentId];
                    if (maxH < component.h)
                        maxH = component.h;
                    if (maxV < component.v)
                        maxV = component.v;
                }
            }
            var mcusPerLine = Math.ceil(frame.samplesPerLine / 8 / maxH);
            var mcusPerColumn = Math.ceil(frame.scanLines / 8 / maxV);
            for (componentId in frame.components) {
                if (frame.components.hasOwnProperty(componentId)) {
                    component = frame.components[componentId];
                    var blocksPerLine = Math.ceil(Math.ceil(frame.samplesPerLine / 8) * component.h / maxH);
                    var blocksPerColumn = Math.ceil(Math.ceil(frame.scanLines / 8) * component.v / maxV);
                    var blocksPerLineForMcu = mcusPerLine * component.h;
                    var blocksPerColumnForMcu = mcusPerColumn * component.v;
                    var blocksToAllocate = blocksPerColumnForMcu * blocksPerLineForMcu;
                    var blocks = [];
                    // Each block is a Int32Array of length 64 (4 x 64 = 256 bytes)
                    JpegImage.requestMemoryAllocation(blocksToAllocate * 256);
                    for (var i = 0; i < blocksPerColumnForMcu; i++) {
                        var row = [];
                        for (var j = 0; j < blocksPerLineForMcu; j++)
                            row.push(new Int32Array(64));
                        blocks.push(row);
                    }
                    component.blocksPerLine = blocksPerLine;
                    component.blocksPerColumn = blocksPerColumn;
                    component.blocks = blocks;
                }
            }
            frame.maxH = maxH;
            frame.maxV = maxV;
            frame.mcusPerLine = mcusPerLine;
            frame.mcusPerColumn = mcusPerColumn;
        }
        var jfif = null;
        var adobe = null;
        var pixels = null;
        var frame, resetInterval;
        var quantizationTables = [], frames = [];
        var huffmanTablesAC = [], huffmanTablesDC = [];
        var fileMarker = readUint16();
        var malformedDataOffset = -1;
        this.comments = [];
        if (fileMarker != 0xFFD8) { // SOI (Start of Image)
            throw new Error("SOI not found");
        }
        fileMarker = readUint16();
        while (fileMarker != 0xFFD9) { // EOI (End of image)
            var i, j, l;
            switch (fileMarker) {
                case 0xFF00: break;
                case 0xFFE0: // APP0 (Application Specific)
                case 0xFFE1: // APP1
                case 0xFFE2: // APP2
                case 0xFFE3: // APP3
                case 0xFFE4: // APP4
                case 0xFFE5: // APP5
                case 0xFFE6: // APP6
                case 0xFFE7: // APP7
                case 0xFFE8: // APP8
                case 0xFFE9: // APP9
                case 0xFFEA: // APP10
                case 0xFFEB: // APP11
                case 0xFFEC: // APP12
                case 0xFFED: // APP13
                case 0xFFEE: // APP14
                case 0xFFEF: // APP15
                case 0xFFFE: // COM (Comment)
                    var appData = readDataBlock();
                    if (fileMarker === 0xFFFE) {
                        var comment = String.fromCharCode.apply(null, appData);
                        this.comments.push(comment);
                    }
                    if (fileMarker === 0xFFE0) {
                        if (appData[0] === 0x4A && appData[1] === 0x46 && appData[2] === 0x49 &&
                            appData[3] === 0x46 && appData[4] === 0) { // 'JFIF\x00'
                            jfif = {
                                version: { major: appData[5], minor: appData[6] },
                                densityUnits: appData[7],
                                xDensity: (appData[8] << 8) | appData[9],
                                yDensity: (appData[10] << 8) | appData[11],
                                thumbWidth: appData[12],
                                thumbHeight: appData[13],
                                thumbData: appData.subarray(14, 14 + 3 * appData[12] * appData[13])
                            };
                        }
                    }
                    // TODO APP1 - Exif
                    if (fileMarker === 0xFFE1) {
                        if (appData[0] === 0x45 &&
                            appData[1] === 0x78 &&
                            appData[2] === 0x69 &&
                            appData[3] === 0x66 &&
                            appData[4] === 0) { // 'EXIF\x00'
                            this.exifBuffer = appData.subarray(5, appData.length);
                        }
                    }
                    if (fileMarker === 0xFFEE) {
                        if (appData[0] === 0x41 && appData[1] === 0x64 && appData[2] === 0x6F &&
                            appData[3] === 0x62 && appData[4] === 0x65 && appData[5] === 0) { // 'Adobe\x00'
                            adobe = {
                                version: appData[6],
                                flags0: (appData[7] << 8) | appData[8],
                                flags1: (appData[9] << 8) | appData[10],
                                transformCode: appData[11]
                            };
                        }
                    }
                    break;
                case 0xFFDB: // DQT (Define Quantization Tables)
                    var quantizationTablesLength = readUint16();
                    var quantizationTablesEnd = quantizationTablesLength + offset - 2;
                    while (offset < quantizationTablesEnd) {
                        var quantizationTableSpec = data[offset++];
                        JpegImage.requestMemoryAllocation(64 * 4);
                        var tableData = new Int32Array(64);
                        if ((quantizationTableSpec >> 4) === 0) { // 8 bit values
                            for (j = 0; j < 64; j++) {
                                var z = dctZigZag[j];
                                tableData[z] = data[offset++];
                            }
                        }
                        else if ((quantizationTableSpec >> 4) === 1) { //16 bit
                            for (j = 0; j < 64; j++) {
                                var z = dctZigZag[j];
                                tableData[z] = readUint16();
                            }
                        }
                        else
                            throw new Error("DQT: invalid table spec");
                        quantizationTables[quantizationTableSpec & 15] = tableData;
                    }
                    break;
                case 0xFFC0: // SOF0 (Start of Frame, Baseline DCT)
                case 0xFFC1: // SOF1 (Start of Frame, Extended DCT)
                case 0xFFC2: // SOF2 (Start of Frame, Progressive DCT)
                    readUint16(); // skip data length
                    frame = {};
                    frame.extended = (fileMarker === 0xFFC1);
                    frame.progressive = (fileMarker === 0xFFC2);
                    frame.precision = data[offset++];
                    frame.scanLines = readUint16();
                    frame.samplesPerLine = readUint16();
                    frame.components = {};
                    frame.componentsOrder = [];
                    var pixelsInFrame = frame.scanLines * frame.samplesPerLine;
                    if (pixelsInFrame > maxResolutionInPixels) {
                        var exceededAmount = Math.ceil((pixelsInFrame - maxResolutionInPixels) / 1e6);
                        throw new Error(`maxResolutionInMP limit exceeded by ${exceededAmount}MP`);
                    }
                    var componentsCount = data[offset++], componentId;
                    var maxH = 0, maxV = 0;
                    for (i = 0; i < componentsCount; i++) {
                        componentId = data[offset];
                        var h = data[offset + 1] >> 4;
                        var v = data[offset + 1] & 15;
                        var qId = data[offset + 2];
                        frame.componentsOrder.push(componentId);
                        frame.components[componentId] = {
                            h: h,
                            v: v,
                            quantizationIdx: qId
                        };
                        offset += 3;
                    }
                    prepareComponents(frame);
                    frames.push(frame);
                    break;
                case 0xFFC4: // DHT (Define Huffman Tables)
                    var huffmanLength = readUint16();
                    for (i = 2; i < huffmanLength;) {
                        var huffmanTableSpec = data[offset++];
                        var codeLengths = new Uint8Array(16);
                        var codeLengthSum = 0;
                        for (j = 0; j < 16; j++, offset++) {
                            codeLengthSum += (codeLengths[j] = data[offset]);
                        }
                        JpegImage.requestMemoryAllocation(16 + codeLengthSum);
                        var huffmanValues = new Uint8Array(codeLengthSum);
                        for (j = 0; j < codeLengthSum; j++, offset++)
                            huffmanValues[j] = data[offset];
                        i += 17 + codeLengthSum;
                        ((huffmanTableSpec >> 4) === 0 ?
                            huffmanTablesDC : huffmanTablesAC)[huffmanTableSpec & 15] =
                            buildHuffmanTable(codeLengths, huffmanValues);
                    }
                    break;
                case 0xFFDD: // DRI (Define Restart Interval)
                    readUint16(); // skip data length
                    resetInterval = readUint16();
                    break;
                case 0xFFDC: // Number of Lines marker
                    readUint16(); // skip data length
                    readUint16(); // Ignore this data since it represents the image height
                    break;
                case 0xFFDA: // SOS (Start of Scan)
                    var scanLength = readUint16();
                    var selectorsCount = data[offset++];
                    var components = [], component;
                    for (i = 0; i < selectorsCount; i++) {
                        component = frame.components[data[offset++]];
                        var tableSpec = data[offset++];
                        component.huffmanTableDC = huffmanTablesDC[tableSpec >> 4];
                        component.huffmanTableAC = huffmanTablesAC[tableSpec & 15];
                        components.push(component);
                    }
                    var spectralStart = data[offset++];
                    var spectralEnd = data[offset++];
                    var successiveApproximation = data[offset++];
                    var processed = decodeScan(data, offset, frame, components, resetInterval, spectralStart, spectralEnd, successiveApproximation >> 4, successiveApproximation & 15, this.opts);
                    offset += processed;
                    break;
                case 0xFFFF: // Fill bytes
                    if (data[offset] !== 0xFF) { // Avoid skipping a valid marker.
                        offset--;
                    }
                    break;
                default:
                    if (data[offset - 3] == 0xFF &&
                        data[offset - 2] >= 0xC0 && data[offset - 2] <= 0xFE) {
                        // could be incorrect encoding -- last 0xFF byte of the previous
                        // block was eaten by the encoder
                        offset -= 3;
                        break;
                    }
                    else if (fileMarker === 0xE0 || fileMarker == 0xE1) {
                        // Recover from malformed APP1 markers popular in some phone models.
                        // See https://github.com/eugeneware/jpeg-js/issues/82
                        if (malformedDataOffset !== -1) {
                            throw new Error(`first unknown JPEG marker at offset ${malformedDataOffset.toString(16)}, second unknown JPEG marker ${fileMarker.toString(16)} at offset ${(offset - 1).toString(16)}`);
                        }
                        malformedDataOffset = offset - 1;
                        const nextOffset = readUint16();
                        if (data[offset + nextOffset - 2] === 0xFF) {
                            offset += nextOffset - 2;
                            break;
                        }
                    }
                    throw new Error("unknown JPEG marker " + fileMarker.toString(16));
            }
            fileMarker = readUint16();
        }
        if (frames.length != 1)
            throw new Error("only single frame JPEGs supported");
        // set each frame's components quantization table
        for (var i = 0; i < frames.length; i++) {
            var cp = frames[i].components;
            for (var j in cp) {
                cp[j].quantizationTable = quantizationTables[cp[j].quantizationIdx];
                delete cp[j].quantizationIdx;
            }
        }
        this.width = frame.samplesPerLine;
        this.height = frame.scanLines;
        this.jfif = jfif;
        this.adobe = adobe;
        this.components = [];
        // for (var i = 0; i < frame.componentsOrder.length; i++) {
        //   var component = frame.components[frame.componentsOrder[i]];
        //   this.components.push({
        //     lines: buildComponentData(frame, component),
        //     scaleX: component.h / frame.maxH,
        //     scaleY: component.v / frame.maxV
        //   });
        // }
        this.quality = 0;
        let sum = 0;
        for (let i = 0; i < quantizationTables.length; i++) {
            const qtable = quantizationTables[i];
            if (qtable) {
                for (let j = 0; j < qtable.length; j++) {
                    sum += qtable[j];
                }
            }
        }
        if (quantizationTables[0] && quantizationTables[1]) {
            const hash = [
                1020, 1015, 932, 848, 780, 735, 702, 679, 660, 645,
                632, 623, 613, 607, 600, 594, 589, 585, 581, 571,
                555, 542, 529, 514, 494, 474, 457, 439, 424, 410,
                397, 386, 373, 364, 351, 341, 334, 324, 317, 309,
                299, 294, 287, 279, 274, 267, 262, 257, 251, 247,
                243, 237, 232, 227, 222, 217, 213, 207, 202, 198,
                192, 188, 183, 177, 173, 168, 163, 157, 153, 148,
                143, 139, 132, 128, 125, 119, 115, 108, 104, 99,
                94, 90, 84, 79, 74, 70, 64, 59, 55, 49,
                45, 40, 34, 30, 25, 20, 15, 11, 6, 4,
                0
            ];
            const sums = [
                32640, 32635, 32266, 31495, 30665, 29804, 29146, 28599, 28104,
                27670, 27225, 26725, 26210, 25716, 25240, 24789, 24373, 23946,
                23572, 22846, 21801, 20842, 19949, 19121, 18386, 17651, 16998,
                16349, 15800, 15247, 14783, 14321, 13859, 13535, 13081, 12702,
                12423, 12056, 11779, 11513, 11135, 10955, 10676, 10392, 10208,
                9928, 9747, 9564, 9369, 9193, 9017, 8822, 8639, 8458,
                8270, 8084, 7896, 7710, 7527, 7347, 7156, 6977, 6788,
                6607, 6422, 6236, 6054, 5867, 5684, 5495, 5305, 5128,
                4945, 4751, 4638, 4442, 4248, 4065, 3888, 3698, 3509,
                3326, 3139, 2957, 2775, 2586, 2405, 2216, 2037, 1846,
                1666, 1483, 1297, 1109, 927, 735, 554, 375, 201,
                128, 0
            ];
            const qvalue = (quantizationTables[0][2] +
                quantizationTables[0][53] +
                quantizationTables[1][0] +
                quantizationTables[1][63]);
            for (i = 0; i < 100; i++) {
                if ((qvalue < hash[i]) && (sum < sums[i])) {
                    continue;
                }
                if (((qvalue <= hash[i]) && (sum <= sums[i])) || (i >= 50)) {
                    this.quality = i + 1;
                }
                break;
            }
        }
        else if (quantizationTables[0]) {
            const hash = [
                510, 505, 422, 380, 355, 338, 326, 318, 311, 305,
                300, 297, 293, 291, 288, 286, 284, 283, 281, 280,
                279, 278, 277, 273, 262, 251, 243, 233, 225, 218,
                211, 205, 198, 193, 186, 181, 177, 172, 168, 164,
                158, 156, 152, 148, 145, 142, 139, 136, 133, 131,
                129, 126, 123, 120, 118, 115, 113, 110, 107, 105,
                102, 100, 97, 94, 92, 89, 87, 83, 81, 79,
                76, 74, 70, 68, 66, 63, 61, 57, 55, 52,
                50, 48, 44, 42, 39, 37, 34, 31, 29, 26,
                24, 21, 18, 16, 13, 11, 8, 6, 3, 2,
                0
            ];
            const sums = [
                16320, 16315, 15946, 15277, 14655, 14073, 13623, 13230, 12859,
                12560, 12240, 11861, 11456, 11081, 10714, 10360, 10027, 9679,
                9368, 9056, 8680, 8331, 7995, 7668, 7376, 7084, 6823,
                6562, 6345, 6125, 5939, 5756, 5571, 5421, 5240, 5086,
                4976, 4829, 4719, 4616, 4463, 4393, 4280, 4166, 4092,
                3980, 3909, 3835, 3755, 3688, 3621, 3541, 3467, 3396,
                3323, 3247, 3170, 3096, 3021, 2952, 2874, 2804, 2727,
                2657, 2583, 2509, 2437, 2362, 2290, 2211, 2136, 2068,
                1996, 1915, 1858, 1773, 1692, 1620, 1552, 1477, 1398,
                1326, 1251, 1179, 1109, 1031, 961, 884, 814, 736,
                667, 592, 518, 441, 369, 292, 221, 151, 86,
                64, 0
            ];
            const qvalue = (quantizationTables[0][2] +
                quantizationTables[0][53]);
            for (i = 0; i < 100; i++) {
                if ((qvalue < hash[i]) && (sum < sums[i])) {
                    continue;
                }
                if (((qvalue <= hash[i]) && (sum <= sums[i])) || (i >= 50)) {
                    this.quality = i + 1;
                }
                break;
            }
        }
    }
}
JpegImage.totalBytesAllocated = 0;
JpegImage.maxMemoryUsageBytes = 0;
module.exports = {
    decode
};
function decode(jpegData, userOpts = {}) {
    var defaultOpts = {
        // "undefined" means "Choose whether to transform colors based on the image’s color model."
        colorTransform: undefined,
        useTArray: false,
        formatAsRGBA: true,
        tolerantDecoding: true,
        maxResolutionInMP: 250,
        maxMemoryUsageInMB: 512, // Don't decode if memory footprint is more than 512MB
    };
    var opts = { ...defaultOpts, ...userOpts };
    var arr = new Uint8Array(jpegData);
    var decoder = new JpegImage();
    decoder.opts = opts;
    // If this constructor ever supports async decoding this will need to be done differently.
    // Until then, treating as singleton limit is fine.
    JpegImage.resetMaxMemoryUsage(opts.maxMemoryUsageInMB * 1024 * 1024);
    decoder.parse(arr);
    return decoder;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianBlZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm9jZXNzb3IvaW1hZ2UvanBlZy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7bUVBQ21FO0FBQ25FOzs7Ozs7Ozs7Ozs7OztFQWNFO0FBRUYsNkVBQTZFO0FBQzdFLDJDQUEyQztBQUMzQyw0RUFBNEU7QUFDNUUseUNBQXlDO0FBQ3pDLGtGQUFrRjtBQUNsRixnREFBZ0Q7QUFDaEQsd0VBQXdFO0FBRXhFLE1BQU0sU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDO0lBQy9CLENBQUM7SUFDRCxDQUFDLEVBQUUsQ0FBQztJQUNKLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztJQUNSLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7SUFDYixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUNqQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7SUFDckIsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUN6QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUM3QixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO0lBQzFCLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUN0QixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUNsQixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO0lBQ2QsRUFBRSxFQUFFLEVBQUUsRUFBRSxF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RUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2xELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUU7Z0JBQy9DLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7Z0JBQ3RDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUM7Z0JBQ3BDLENBQUM7YUFDRixDQUFDO1lBQ0YsTUFBTSxJQUFJLEdBQUc7Z0JBQ1gsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLO2dCQUM3RCxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7Z0JBQzdELEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSztnQkFDN0QsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLO2dCQUM3RCxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7Z0JBQzdELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQy9DLEdBQUcsRUFBRSxDQUFDO2FBQ1AsQ0FBQztZQUNGLE1BQU0sTUFBTSxHQUFHLENBQ2Isa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7Z0JBQ3pCLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQzFCLENBQUM7WUFFRixLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDeEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFBRSxTQUFTO2lCQUFFO2dCQUN4RCxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRTtvQkFDMUQsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUN0QjtnQkFDRCxNQUFNO2FBQ1A7U0FDRjthQUFNLElBQUksa0JBQWtCLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDaEMsTUFBTSxJQUFJLEdBQ1I7Z0JBQ0UsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDeEMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDdEMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDdEMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDbEMsQ0FBQzthQUNGLENBQUM7WUFDSixNQUFNLElBQUksR0FDUjtnQkFDRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7Z0JBQzdELEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsSUFBSTtnQkFDNUQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUc7Z0JBQ2hELEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDMUMsRUFBRSxFQUFFLENBQUM7YUFDTixDQUFDO1lBRUosTUFBTSxNQUFNLEdBQUcsQ0FDYixrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUMxQixDQUFDO1lBRUYsS0FBSyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxHQUFHLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQ3hCLElBQUksQ0FBQyxNQUFNLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUU7b0JBQUUsU0FBUztpQkFBRTtnQkFDeEQsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxJQUFJLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLEVBQUU7b0JBQzFELElBQUksQ0FBQyxPQUFPLEdBQUcsQ0FBQyxHQUFHLENBQUMsQ0FBQztpQkFDdEI7Z0JBQ0QsTUFBTTthQUNQO1NBQ0Y7SUFDSCxDQUFDOztBQTdhTSw2QkFBbUIsR0FBRyxDQUFDLENBQUM7QUFDeEIsNkJBQW1CLEdBQUcsQ0FBQyxDQUFDO0FBK2FqQyxNQUFNLENBQUMsT0FBTyxHQUFHO0lBQ2YsTUFBTTtDQUNQLENBQUM7QUFFRixTQUFTLE1BQU0sQ0FBQyxRQUFRLEVBQUUsUUFBUSxHQUFHLEVBQUU7SUFDckMsSUFBSSxXQUFXLEdBQUc7UUFDaEIsMkZBQTJGO1FBQzNGLGNBQWMsRUFBRSxTQUFTO1FBQ3pCLFNBQVMsRUFBRSxLQUFLO1FBQ2hCLFlBQVksRUFBRSxJQUFJO1FBQ2xCLGdCQUFnQixFQUFFLElBQUk7UUFDdEIsaUJBQWlCLEVBQUUsR0FBRztRQUN0QixrQkFBa0IsRUFBRSxHQUFHLEVBQUUsc0RBQXNEO0tBQ2hGLENBQUM7SUFFRixJQUFJLElBQUksR0FBRyxFQUFFLEdBQUcsV0FBVyxFQUFFLEdBQUcsUUFBUSxFQUFFLENBQUM7SUFDM0MsSUFBSSxHQUFHLEdBQUcsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDbkMsSUFBSSxPQUFPLEdBQUcsSUFBSSxTQUFTLEVBQUUsQ0FBQztJQUM5QixPQUFPLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztJQUNwQiwwRkFBMEY7SUFDMUYsbURBQW1EO0lBQ25ELFNBQVMsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLENBQUMsa0JBQWtCLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQyxDQUFDO0lBQ3JFLE9BQU8sQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUM7SUFFbkIsT0FBTyxPQUFPLENBQUE7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qIC0qLSB0YWItd2lkdGg6IDI7IGluZGVudC10YWJzLW1vZGU6IG5pbDsgYy1iYXNpYy1vZmZzZXQ6IDIgLSotIC9cbi8qIHZpbTogc2V0IHNoaWZ0d2lkdGg9MiB0YWJzdG9wPTIgYXV0b2luZGVudCBjaW5kZW50IGV4cGFuZHRhYjogKi9cbi8qXG4gICBDb3B5cmlnaHQgMjAxMSBub3RtYXN0ZXJ5ZXRcblxuICAgTGljZW5zZWQgdW5kZXIgdGhlIEFwYWNoZSBMaWNlbnNlLCBWZXJzaW9uIDIuMCAodGhlIFwiTGljZW5zZVwiKTtcbiAgIHlvdSBtYXkgbm90IHVzZSB0aGlzIGZpbGUgZXhjZXB0IGluIGNvbXBsaWFuY2Ugd2l0aCB0aGUgTGljZW5zZS5cbiAgIFlvdSBtYXkgb2J0YWluIGEgY29weSBvZiB0aGUgTGljZW5zZSBhdFxuXG4gICAgICAgaHR0cDovL3d3dy5hcGFjaGUub3JnL2xpY2Vuc2VzL0xJQ0VOU0UtMi4wXG5cbiAgIFVubGVzcyByZXF1aXJlZCBieSBhcHBsaWNhYmxlIGxhdyBvciBhZ3JlZWQgdG8gaW4gd3JpdGluZywgc29mdHdhcmVcbiAgIGRpc3RyaWJ1dGVkIHVuZGVyIHRoZSBMaWNlbnNlIGlzIGRpc3RyaWJ1dGVkIG9uIGFuIFwiQVMgSVNcIiBCQVNJUyxcbiAgIFdJVEhPVVQgV0FSUkFOVElFUyBPUiBDT05ESVRJT05TIE9GIEFOWSBLSU5ELCBlaXRoZXIgZXhwcmVzcyBvciBpbXBsaWVkLlxuICAgU2VlIHRoZSBMaWNlbnNlIGZvciB0aGUgc3BlY2lmaWMgbGFuZ3VhZ2UgZ292ZXJuaW5nIHBlcm1pc3Npb25zIGFuZFxuICAgbGltaXRhdGlvbnMgdW5kZXIgdGhlIExpY2Vuc2UuXG4qL1xuXG4vLyAtIFRoZSBKUEVHIHNwZWNpZmljYXRpb24gY2FuIGJlIGZvdW5kIGluIHRoZSBJVFUgQ0NJVFQgUmVjb21tZW5kYXRpb24gVC44MVxuLy8gICAod3d3LnczLm9yZy9HcmFwaGljcy9KUEVHL2l0dS10ODEucGRmKVxuLy8gLSBUaGUgSkZJRiBzcGVjaWZpY2F0aW9uIGNhbiBiZSBmb3VuZCBpbiB0aGUgSlBFRyBGaWxlIEludGVyY2hhbmdlIEZvcm1hdFxuLy8gICAod3d3LnczLm9yZy9HcmFwaGljcy9KUEVHL2pmaWYzLnBkZilcbi8vIC0gVGhlIEFkb2JlIEFwcGxpY2F0aW9uLVNwZWNpZmljIEpQRUcgbWFya2VycyBpbiB0aGUgU3VwcG9ydGluZyB0aGUgRENUIEZpbHRlcnNcbi8vICAgaW4gUG9zdFNjcmlwdCBMZXZlbCAyLCBUZWNobmljYWwgTm90ZSAjNTExNlxuLy8gICAocGFydG5lcnMuYWRvYmUuY29tL3B1YmxpYy9kZXZlbG9wZXIvZW4vcHMvc2RrLzUxMTYuRENUX0ZpbHRlci5wZGYpXG5cbmNvbnN0IGRjdFppZ1phZyA9IG5ldyBJbnQzMkFycmF5KFtcbiAgMCxcbiAgMSwgOCxcbiAgMTYsIDksIDIsXG4gIDMsIDEwLCAxNywgMjQsXG4gIDMyLCAyNSwgMTgsIDExLCA0LFxuICA1LCAxMiwgMTksIDI2LCAzMywgNDAsXG4gIDQ4LCA0MSwgMzQsIDI3LCAyMCwgMTMsIDYsXG4gIDcsIDE0LCAyMSwgMjgsIDM1LCA0MiwgNDksIDU2LFxuICA1NywgNTAsIDQzLCAzNiwgMjksIDIyLCAxNSxcbiAgMjMsIDMwLCAzNywgNDQsIDUxLCA1OCxcbiAgNTksIDUyLCA0NSwgMzgsIDMxLFxuICAzOSwgNDYsIDUzLCA2MCxcbiAgNjEsIDU0LCA0NyxcbiAgNTUsIDYyLFxuICA2M1xuXSk7XG5cbmNvbnN0IGRjdENvczEgPSA0MDE3ICAgLy8gY29zKHBpLzE2KVxuY29uc3QgZGN0U2luMSA9IDc5OSAgIC8vIHNpbihwaS8xNilcbmNvbnN0IGRjdENvczMgPSAzNDA2ICAgLy8gY29zKDMqcGkvMTYpXG5jb25zdCBkY3RTaW4zID0gMjI3NiAgIC8vIHNpbigzKnBpLzE2KVxuY29uc3QgZGN0Q29zNiA9IDE1NjcgICAvLyBjb3MoNipwaS8xNilcbmNvbnN0IGRjdFNpbjYgPSAzNzg0ICAgLy8gc2luKDYqcGkvMTYpXG5jb25zdCBkY3RTcXJ0MiA9IDU3OTMgICAvLyBzcXJ0KDIpXG5jb25zdCBkY3RTcXJ0MWQyID0gMjg5NiAgLy8gc3FydCgyKSAvIDJcblxuZnVuY3Rpb24gYnVpbGRIdWZmbWFuVGFibGUoY29kZUxlbmd0aHMsIHZhbHVlcykge1xuICB2YXIgayA9IDAsIGNvZGUgPSBbXSwgaSwgaiwgbGVuZ3RoID0gMTY7XG4gIHdoaWxlIChsZW5ndGggPiAwICYmICFjb2RlTGVuZ3Roc1tsZW5ndGggLSAxXSlcbiAgICBsZW5ndGgtLTtcbiAgY29kZS5wdXNoKHsgY2hpbGRyZW46IFtdLCBpbmRleDogMCB9KTtcbiAgdmFyIHAgPSBjb2RlWzBdLCBxO1xuICBmb3IgKGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICBmb3IgKGogPSAwOyBqIDwgY29kZUxlbmd0aHNbaV07IGorKykge1xuICAgICAgcCA9IGNvZGUucG9wKCk7XG4gICAgICBwLmNoaWxkcmVuW3AuaW5kZXhdID0gdmFsdWVzW2tdO1xuICAgICAgd2hpbGUgKHAuaW5kZXggPiAwKSB7XG4gICAgICAgIGlmIChjb2RlLmxlbmd0aCA9PT0gMClcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0NvdWxkIG5vdCByZWNyZWF0ZSBIdWZmbWFuIFRhYmxlJyk7XG4gICAgICAgIHAgPSBjb2RlLnBvcCgpO1xuICAgICAgfVxuICAgICAgcC5pbmRleCsrO1xuICAgICAgY29kZS5wdXNoKHApO1xuICAgICAgd2hpbGUgKGNvZGUubGVuZ3RoIDw9IGkpIHtcbiAgICAgICAgY29kZS5wdXNoKHEgPSB7IGNoaWxkcmVuOiBbXSwgaW5kZXg6IDAgfSk7XG4gICAgICAgIHAuY2hpbGRyZW5bcC5pbmRleF0gPSBxLmNoaWxkcmVuO1xuICAgICAgICBwID0gcTtcbiAgICAgIH1cbiAgICAgIGsrKztcbiAgICB9XG4gICAgaWYgKGkgKyAxIDwgbGVuZ3RoKSB7XG4gICAgICAvLyBwIGhlcmUgcG9pbnRzIHRvIGxhc3QgY29kZVxuICAgICAgY29kZS5wdXNoKHEgPSB7IGNoaWxkcmVuOiBbXSwgaW5kZXg6IDAgfSk7XG4gICAgICBwLmNoaWxkcmVuW3AuaW5kZXhdID0gcS5jaGlsZHJlbjtcbiAgICAgIHAgPSBxO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY29kZVswXS5jaGlsZHJlbjtcbn1cblxuZnVuY3Rpb24gZGVjb2RlU2NhbihkYXRhLCBvZmZzZXQsXG4gIGZyYW1lLCBjb21wb25lbnRzLCByZXNldEludGVydmFsLFxuICBzcGVjdHJhbFN0YXJ0LCBzcGVjdHJhbEVuZCxcbiAgc3VjY2Vzc2l2ZVByZXYsIHN1Y2Nlc3NpdmUsIG9wdHMpIHtcbiAgdmFyIHByZWNpc2lvbiA9IGZyYW1lLnByZWNpc2lvbjtcbiAgdmFyIHNhbXBsZXNQZXJMaW5lID0gZnJhbWUuc2FtcGxlc1BlckxpbmU7XG4gIHZhciBzY2FuTGluZXMgPSBmcmFtZS5zY2FuTGluZXM7XG4gIHZhciBtY3VzUGVyTGluZSA9IGZyYW1lLm1jdXNQZXJMaW5lO1xuICB2YXIgcHJvZ3Jlc3NpdmUgPSBmcmFtZS5wcm9ncmVzc2l2ZTtcbiAgdmFyIG1heEggPSBmcmFtZS5tYXhILCBtYXhWID0gZnJhbWUubWF4VjtcblxuICB2YXIgc3RhcnRPZmZzZXQgPSBvZmZzZXQsIGJpdHNEYXRhID0gMCwgYml0c0NvdW50ID0gMDtcbiAgZnVuY3Rpb24gcmVhZEJpdCgpIHtcbiAgICBpZiAoYml0c0NvdW50ID4gMCkge1xuICAgICAgYml0c0NvdW50LS07XG4gICAgICByZXR1cm4gKGJpdHNEYXRhID4+IGJpdHNDb3VudCkgJiAxO1xuICAgIH1cbiAgICBiaXRzRGF0YSA9IGRhdGFbb2Zmc2V0KytdO1xuICAgIGlmIChiaXRzRGF0YSA9PSAweEZGKSB7XG4gICAgICB2YXIgbmV4dEJ5dGUgPSBkYXRhW29mZnNldCsrXTtcbiAgICAgIGlmIChuZXh0Qnl0ZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ1bmV4cGVjdGVkIG1hcmtlcjogXCIgKyAoKGJpdHNEYXRhIDw8IDgpIHwgbmV4dEJ5dGUpLnRvU3RyaW5nKDE2KSk7XG4gICAgICB9XG4gICAgICAvLyB1bnN0dWZmIDBcbiAgICB9XG4gICAgYml0c0NvdW50ID0gNztcbiAgICByZXR1cm4gYml0c0RhdGEgPj4+IDc7XG4gIH1cbiAgZnVuY3Rpb24gZGVjb2RlSHVmZm1hbih0cmVlKSB7XG4gICAgdmFyIG5vZGUgPSB0cmVlLCBiaXQ7XG4gICAgd2hpbGUgKChiaXQgPSByZWFkQml0KCkpICE9PSBudWxsKSB7XG4gICAgICBub2RlID0gbm9kZVtiaXRdO1xuICAgICAgaWYgKHR5cGVvZiBub2RlID09PSAnbnVtYmVyJylcbiAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICBpZiAodHlwZW9mIG5vZGUgIT09ICdvYmplY3QnKVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJpbnZhbGlkIGh1ZmZtYW4gc2VxdWVuY2VcIik7XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xuICB9XG4gIGZ1bmN0aW9uIHJlY2VpdmUobGVuZ3RoKSB7XG4gICAgdmFyIG4gPSAwO1xuICAgIHdoaWxlIChsZW5ndGggPiAwKSB7XG4gICAgICB2YXIgYml0ID0gcmVhZEJpdCgpO1xuICAgICAgaWYgKGJpdCA9PT0gbnVsbCkgcmV0dXJuO1xuICAgICAgbiA9IChuIDw8IDEpIHwgYml0O1xuICAgICAgbGVuZ3RoLS07XG4gICAgfVxuICAgIHJldHVybiBuO1xuICB9XG4gIGZ1bmN0aW9uIHJlY2VpdmVBbmRFeHRlbmQobGVuZ3RoKSB7XG4gICAgdmFyIG4gPSByZWNlaXZlKGxlbmd0aCk7XG4gICAgaWYgKG4gPj0gMSA8PCAobGVuZ3RoIC0gMSkpXG4gICAgICByZXR1cm4gbjtcbiAgICByZXR1cm4gbiArICgtMSA8PCBsZW5ndGgpICsgMTtcbiAgfVxuICBmdW5jdGlvbiBkZWNvZGVCYXNlbGluZShjb21wb25lbnQsIHp6KSB7XG4gICAgdmFyIHQgPSBkZWNvZGVIdWZmbWFuKGNvbXBvbmVudC5odWZmbWFuVGFibGVEQyk7XG4gICAgdmFyIGRpZmYgPSB0ID09PSAwID8gMCA6IHJlY2VpdmVBbmRFeHRlbmQodCk7XG4gICAgenpbMF0gPSAoY29tcG9uZW50LnByZWQgKz0gZGlmZik7XG4gICAgdmFyIGsgPSAxO1xuICAgIHdoaWxlIChrIDwgNjQpIHtcbiAgICAgIHZhciBycyA9IGRlY29kZUh1ZmZtYW4oY29tcG9uZW50Lmh1ZmZtYW5UYWJsZUFDKTtcbiAgICAgIHZhciBzID0gcnMgJiAxNSwgciA9IHJzID4+IDQ7XG4gICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICBpZiAociA8IDE1KVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBrICs9IDE2O1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGsgKz0gcjtcbiAgICAgIHZhciB6ID0gZGN0WmlnWmFnW2tdO1xuICAgICAgenpbel0gPSByZWNlaXZlQW5kRXh0ZW5kKHMpO1xuICAgICAgaysrO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBkZWNvZGVEQ0ZpcnN0KGNvbXBvbmVudCwgenopIHtcbiAgICB2YXIgdCA9IGRlY29kZUh1ZmZtYW4oY29tcG9uZW50Lmh1ZmZtYW5UYWJsZURDKTtcbiAgICB2YXIgZGlmZiA9IHQgPT09IDAgPyAwIDogKHJlY2VpdmVBbmRFeHRlbmQodCkgPDwgc3VjY2Vzc2l2ZSk7XG4gICAgenpbMF0gPSAoY29tcG9uZW50LnByZWQgKz0gZGlmZik7XG4gIH1cbiAgZnVuY3Rpb24gZGVjb2RlRENTdWNjZXNzaXZlKGNvbXBvbmVudCwgenopIHtcbiAgICB6elswXSB8PSByZWFkQml0KCkgPDwgc3VjY2Vzc2l2ZTtcbiAgfVxuICB2YXIgZW9icnVuID0gMDtcbiAgZnVuY3Rpb24gZGVjb2RlQUNGaXJzdChjb21wb25lbnQsIHp6KSB7XG4gICAgaWYgKGVvYnJ1biA+IDApIHtcbiAgICAgIGVvYnJ1bi0tO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgayA9IHNwZWN0cmFsU3RhcnQsIGUgPSBzcGVjdHJhbEVuZDtcbiAgICB3aGlsZSAoayA8PSBlKSB7XG4gICAgICB2YXIgcnMgPSBkZWNvZGVIdWZmbWFuKGNvbXBvbmVudC5odWZmbWFuVGFibGVBQyk7XG4gICAgICB2YXIgcyA9IHJzICYgMTUsIHIgPSBycyA+PiA0O1xuICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgaWYgKHIgPCAxNSkge1xuICAgICAgICAgIGVvYnJ1biA9IHJlY2VpdmUocikgKyAoMSA8PCByKSAtIDE7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgayArPSAxNjtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBrICs9IHI7XG4gICAgICB2YXIgeiA9IGRjdFppZ1phZ1trXTtcbiAgICAgIHp6W3pdID0gcmVjZWl2ZUFuZEV4dGVuZChzKSAqICgxIDw8IHN1Y2Nlc3NpdmUpO1xuICAgICAgaysrO1xuICAgIH1cbiAgfVxuICB2YXIgc3VjY2Vzc2l2ZUFDU3RhdGUgPSAwLCBzdWNjZXNzaXZlQUNOZXh0VmFsdWU7XG4gIGZ1bmN0aW9uIGRlY29kZUFDU3VjY2Vzc2l2ZShjb21wb25lbnQsIHp6KSB7XG4gICAgdmFyIGsgPSBzcGVjdHJhbFN0YXJ0LCBlID0gc3BlY3RyYWxFbmQsIHIgPSAwO1xuICAgIHdoaWxlIChrIDw9IGUpIHtcbiAgICAgIHZhciB6ID0gZGN0WmlnWmFnW2tdO1xuICAgICAgdmFyIGRpcmVjdGlvbiA9IHp6W3pdIDwgMCA/IC0xIDogMTtcbiAgICAgIHN3aXRjaCAoc3VjY2Vzc2l2ZUFDU3RhdGUpIHtcbiAgICAgICAgY2FzZSAwOiAvLyBpbml0aWFsIHN0YXRlXG4gICAgICAgICAgdmFyIHJzID0gZGVjb2RlSHVmZm1hbihjb21wb25lbnQuaHVmZm1hblRhYmxlQUMpO1xuICAgICAgICAgIHZhciBzID0gcnMgJiAxNSwgciA9IHJzID4+IDQ7XG4gICAgICAgICAgaWYgKHMgPT09IDApIHtcbiAgICAgICAgICAgIGlmIChyIDwgMTUpIHtcbiAgICAgICAgICAgICAgZW9icnVuID0gcmVjZWl2ZShyKSArICgxIDw8IHIpO1xuICAgICAgICAgICAgICBzdWNjZXNzaXZlQUNTdGF0ZSA9IDQ7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICByID0gMTY7XG4gICAgICAgICAgICAgIHN1Y2Nlc3NpdmVBQ1N0YXRlID0gMTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKHMgIT09IDEpXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgQUNuIGVuY29kaW5nXCIpO1xuICAgICAgICAgICAgc3VjY2Vzc2l2ZUFDTmV4dFZhbHVlID0gcmVjZWl2ZUFuZEV4dGVuZChzKTtcbiAgICAgICAgICAgIHN1Y2Nlc3NpdmVBQ1N0YXRlID0gciA/IDIgOiAzO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgY2FzZSAxOiAvLyBza2lwcGluZyByIHplcm8gaXRlbXNcbiAgICAgICAgY2FzZSAyOlxuICAgICAgICAgIGlmICh6elt6XSlcbiAgICAgICAgICAgIHp6W3pdICs9IChyZWFkQml0KCkgPDwgc3VjY2Vzc2l2ZSkgKiBkaXJlY3Rpb247XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICByLS07XG4gICAgICAgICAgICBpZiAociA9PT0gMClcbiAgICAgICAgICAgICAgc3VjY2Vzc2l2ZUFDU3RhdGUgPSBzdWNjZXNzaXZlQUNTdGF0ZSA9PSAyID8gMyA6IDA7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIDM6IC8vIHNldCB2YWx1ZSBmb3IgYSB6ZXJvIGl0ZW1cbiAgICAgICAgICBpZiAoenpbel0pXG4gICAgICAgICAgICB6elt6XSArPSAocmVhZEJpdCgpIDw8IHN1Y2Nlc3NpdmUpICogZGlyZWN0aW9uO1xuICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgenpbel0gPSBzdWNjZXNzaXZlQUNOZXh0VmFsdWUgPDwgc3VjY2Vzc2l2ZTtcbiAgICAgICAgICAgIHN1Y2Nlc3NpdmVBQ1N0YXRlID0gMDtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgNDogLy8gZW9iXG4gICAgICAgICAgaWYgKHp6W3pdKVxuICAgICAgICAgICAgenpbel0gKz0gKHJlYWRCaXQoKSA8PCBzdWNjZXNzaXZlKSAqIGRpcmVjdGlvbjtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICAgIGsrKztcbiAgICB9XG4gICAgaWYgKHN1Y2Nlc3NpdmVBQ1N0YXRlID09PSA0KSB7XG4gICAgICBlb2JydW4tLTtcbiAgICAgIGlmIChlb2JydW4gPT09IDApXG4gICAgICAgIHN1Y2Nlc3NpdmVBQ1N0YXRlID0gMDtcbiAgICB9XG4gIH1cbiAgZnVuY3Rpb24gZGVjb2RlTWN1KGNvbXBvbmVudCwgZGVjb2RlLCBtY3UsIHJvdywgY29sKSB7XG4gICAgdmFyIG1jdVJvdyA9IChtY3UgLyBtY3VzUGVyTGluZSkgfCAwO1xuICAgIHZhciBtY3VDb2wgPSBtY3UgJSBtY3VzUGVyTGluZTtcbiAgICB2YXIgYmxvY2tSb3cgPSBtY3VSb3cgKiBjb21wb25lbnQudiArIHJvdztcbiAgICB2YXIgYmxvY2tDb2wgPSBtY3VDb2wgKiBjb21wb25lbnQuaCArIGNvbDtcbiAgICAvLyBJZiB0aGUgYmxvY2sgaXMgbWlzc2luZyBhbmQgd2UncmUgaW4gdG9sZXJhbnQgbW9kZSwganVzdCBza2lwIGl0LlxuICAgIGlmIChjb21wb25lbnQuYmxvY2tzW2Jsb2NrUm93XSA9PT0gdW5kZWZpbmVkICYmIG9wdHMudG9sZXJhbnREZWNvZGluZylcbiAgICAgIHJldHVybjtcbiAgICBkZWNvZGUoY29tcG9uZW50LCBjb21wb25lbnQuYmxvY2tzW2Jsb2NrUm93XVtibG9ja0NvbF0pO1xuICB9XG4gIGZ1bmN0aW9uIGRlY29kZUJsb2NrKGNvbXBvbmVudCwgZGVjb2RlLCBtY3UpIHtcbiAgICB2YXIgYmxvY2tSb3cgPSAobWN1IC8gY29tcG9uZW50LmJsb2Nrc1BlckxpbmUpIHwgMDtcbiAgICB2YXIgYmxvY2tDb2wgPSBtY3UgJSBjb21wb25lbnQuYmxvY2tzUGVyTGluZTtcbiAgICAvLyBJZiB0aGUgYmxvY2sgaXMgbWlzc2luZyBhbmQgd2UncmUgaW4gdG9sZXJhbnQgbW9kZSwganVzdCBza2lwIGl0LlxuICAgIGlmIChjb21wb25lbnQuYmxvY2tzW2Jsb2NrUm93XSA9PT0gdW5kZWZpbmVkICYmIG9wdHMudG9sZXJhbnREZWNvZGluZylcbiAgICAgIHJldHVybjtcbiAgICBkZWNvZGUoY29tcG9uZW50LCBjb21wb25lbnQuYmxvY2tzW2Jsb2NrUm93XVtibG9ja0NvbF0pO1xuICB9XG5cbiAgdmFyIGNvbXBvbmVudHNMZW5ndGggPSBjb21wb25lbnRzLmxlbmd0aDtcbiAgdmFyIGNvbXBvbmVudCwgaSwgaiwgaywgbjtcbiAgdmFyIGRlY29kZUZuO1xuICBpZiAocHJvZ3Jlc3NpdmUpIHtcbiAgICBpZiAoc3BlY3RyYWxTdGFydCA9PT0gMClcbiAgICAgIGRlY29kZUZuID0gc3VjY2Vzc2l2ZVByZXYgPT09IDAgPyBkZWNvZGVEQ0ZpcnN0IDogZGVjb2RlRENTdWNjZXNzaXZlO1xuICAgIGVsc2VcbiAgICAgIGRlY29kZUZuID0gc3VjY2Vzc2l2ZVByZXYgPT09IDAgPyBkZWNvZGVBQ0ZpcnN0IDogZGVjb2RlQUNTdWNjZXNzaXZlO1xuICB9IGVsc2Uge1xuICAgIGRlY29kZUZuID0gZGVjb2RlQmFzZWxpbmU7XG4gIH1cblxuICB2YXIgbWN1ID0gMCwgbWFya2VyO1xuICB2YXIgbWN1RXhwZWN0ZWQ7XG4gIGlmIChjb21wb25lbnRzTGVuZ3RoID09IDEpIHtcbiAgICBtY3VFeHBlY3RlZCA9IGNvbXBvbmVudHNbMF0uYmxvY2tzUGVyTGluZSAqIGNvbXBvbmVudHNbMF0uYmxvY2tzUGVyQ29sdW1uO1xuICB9IGVsc2Uge1xuICAgIG1jdUV4cGVjdGVkID0gbWN1c1BlckxpbmUgKiBmcmFtZS5tY3VzUGVyQ29sdW1uO1xuICB9XG4gIGlmICghcmVzZXRJbnRlcnZhbCkgcmVzZXRJbnRlcnZhbCA9IG1jdUV4cGVjdGVkO1xuXG4gIHZhciBoLCB2O1xuICB3aGlsZSAobWN1IDwgbWN1RXhwZWN0ZWQpIHtcbiAgICAvLyByZXNldCBpbnRlcnZhbCBzdHVmZlxuICAgIGZvciAoaSA9IDA7IGkgPCBjb21wb25lbnRzTGVuZ3RoOyBpKyspXG4gICAgICBjb21wb25lbnRzW2ldLnByZWQgPSAwO1xuICAgIGVvYnJ1biA9IDA7XG5cbiAgICBpZiAoY29tcG9uZW50c0xlbmd0aCA9PSAxKSB7XG4gICAgICBjb21wb25lbnQgPSBjb21wb25lbnRzWzBdO1xuICAgICAgZm9yIChuID0gMDsgbiA8IHJlc2V0SW50ZXJ2YWw7IG4rKykge1xuICAgICAgICBkZWNvZGVCbG9jayhjb21wb25lbnQsIGRlY29kZUZuLCBtY3UpO1xuICAgICAgICBtY3UrKztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgZm9yIChuID0gMDsgbiA8IHJlc2V0SW50ZXJ2YWw7IG4rKykge1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29tcG9uZW50c0xlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgY29tcG9uZW50ID0gY29tcG9uZW50c1tpXTtcbiAgICAgICAgICBoID0gY29tcG9uZW50Lmg7XG4gICAgICAgICAgdiA9IGNvbXBvbmVudC52O1xuICAgICAgICAgIGZvciAoaiA9IDA7IGogPCB2OyBqKyspIHtcbiAgICAgICAgICAgIGZvciAoayA9IDA7IGsgPCBoOyBrKyspIHtcbiAgICAgICAgICAgICAgZGVjb2RlTWN1KGNvbXBvbmVudCwgZGVjb2RlRm4sIG1jdSwgaiwgayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG1jdSsrO1xuXG4gICAgICAgIC8vIElmIHdlJ3ZlIHJlYWNoZWQgb3VyIGV4cGVjdGVkIE1DVSdzLCBzdG9wIGRlY29kaW5nXG4gICAgICAgIGlmIChtY3UgPT09IG1jdUV4cGVjdGVkKSBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAobWN1ID09PSBtY3VFeHBlY3RlZCkge1xuICAgICAgLy8gU2tpcCB0cmFpbGluZyBieXRlcyBhdCB0aGUgZW5kIG9mIHRoZSBzY2FuIC0gdW50aWwgd2UgcmVhY2ggdGhlIG5leHQgbWFya2VyXG4gICAgICBkbyB7XG4gICAgICAgIGlmIChkYXRhW29mZnNldF0gPT09IDB4RkYpIHtcbiAgICAgICAgICBpZiAoZGF0YVtvZmZzZXQgKyAxXSAhPT0gMHgwMCkge1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIG9mZnNldCArPSAxO1xuICAgICAgfSB3aGlsZSAob2Zmc2V0IDwgZGF0YS5sZW5ndGggLSAyKTtcbiAgICB9XG5cbiAgICAvLyBmaW5kIG1hcmtlclxuICAgIGJpdHNDb3VudCA9IDA7XG4gICAgbWFya2VyID0gKGRhdGFbb2Zmc2V0XSA8PCA4KSB8IGRhdGFbb2Zmc2V0ICsgMV07XG4gICAgaWYgKG1hcmtlciA8IDB4RkYwMCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFwibWFya2VyIHdhcyBub3QgZm91bmRcIik7XG4gICAgfVxuXG4gICAgaWYgKG1hcmtlciA+PSAweEZGRDAgJiYgbWFya2VyIDw9IDB4RkZENykgeyAvLyBSU1R4XG4gICAgICBvZmZzZXQgKz0gMjtcbiAgICB9XG4gICAgZWxzZVxuICAgICAgYnJlYWs7XG4gIH1cblxuICByZXR1cm4gb2Zmc2V0IC0gc3RhcnRPZmZzZXQ7XG59XG5cbmZ1bmN0aW9uIGJ1aWxkQ29tcG9uZW50RGF0YShmcmFtZSwgY29tcG9uZW50KSB7XG4gIHZhciBsaW5lcyA9IFtdO1xuICB2YXIgYmxvY2tzUGVyTGluZSA9IGNvbXBvbmVudC5ibG9ja3NQZXJMaW5lO1xuICB2YXIgYmxvY2tzUGVyQ29sdW1uID0gY29tcG9uZW50LmJsb2Nrc1BlckNvbHVtbjtcbiAgdmFyIHNhbXBsZXNQZXJMaW5lID0gYmxvY2tzUGVyTGluZSA8PCAzO1xuICAvLyBPbmx5IDEgdXNlZCBwZXIgaW52b2NhdGlvbiBvZiB0aGlzIGZ1bmN0aW9uIGFuZCBnYXJiYWdlIGNvbGxlY3RlZCBhZnRlciBpbnZvY2F0aW9uLCBzbyBubyBuZWVkIHRvIGFjY291bnQgZm9yIGl0cyBtZW1vcnkgZm9vdHByaW50LlxuICB2YXIgUiA9IG5ldyBJbnQzMkFycmF5KDY0KSwgciA9IG5ldyBVaW50OEFycmF5KDY0KTtcblxuICAvLyBBIHBvcnQgb2YgcG9wcGxlcidzIElEQ1QgbWV0aG9kIHdoaWNoIGluIHR1cm4gaXMgdGFrZW4gZnJvbTpcbiAgLy8gICBDaHJpc3RvcGggTG9lZmZsZXIsIEFkcmlhYW4gTGlndGVuYmVyZywgR2VvcmdlIFMuIE1vc2NoeXR6LFxuICAvLyAgIFwiUHJhY3RpY2FsIEZhc3QgMS1EIERDVCBBbGdvcml0aG1zIHdpdGggMTEgTXVsdGlwbGljYXRpb25zXCIsXG4gIC8vICAgSUVFRSBJbnRsLiBDb25mLiBvbiBBY291c3RpY3MsIFNwZWVjaCAmIFNpZ25hbCBQcm9jZXNzaW5nLCAxOTg5LFxuICAvLyAgIDk4OC05OTEuXG4gIGZ1bmN0aW9uIHF1YW50aXplQW5kSW52ZXJzZSh6eiwgZGF0YU91dCwgZGF0YUluKSB7XG4gICAgdmFyIHF0ID0gY29tcG9uZW50LnF1YW50aXphdGlvblRhYmxlO1xuICAgIHZhciB2MCwgdjEsIHYyLCB2MywgdjQsIHY1LCB2NiwgdjcsIHQ7XG4gICAgdmFyIHAgPSBkYXRhSW47XG4gICAgdmFyIGk7XG5cbiAgICAvLyBkZXF1YW50XG4gICAgZm9yIChpID0gMDsgaSA8IDY0OyBpKyspXG4gICAgICBwW2ldID0genpbaV0gKiBxdFtpXTtcblxuICAgIC8vIGludmVyc2UgRENUIG9uIHJvd3NcbiAgICBmb3IgKGkgPSAwOyBpIDwgODsgKytpKSB7XG4gICAgICB2YXIgcm93ID0gOCAqIGk7XG5cbiAgICAgIC8vIGNoZWNrIGZvciBhbGwtemVybyBBQyBjb2VmZmljaWVudHNcbiAgICAgIGlmIChwWzEgKyByb3ddID09IDAgJiYgcFsyICsgcm93XSA9PSAwICYmIHBbMyArIHJvd10gPT0gMCAmJlxuICAgICAgICBwWzQgKyByb3ddID09IDAgJiYgcFs1ICsgcm93XSA9PSAwICYmIHBbNiArIHJvd10gPT0gMCAmJlxuICAgICAgICBwWzcgKyByb3ddID09IDApIHtcbiAgICAgICAgdCA9IChkY3RTcXJ0MiAqIHBbMCArIHJvd10gKyA1MTIpID4+IDEwO1xuICAgICAgICBwWzAgKyByb3ddID0gdDtcbiAgICAgICAgcFsxICsgcm93XSA9IHQ7XG4gICAgICAgIHBbMiArIHJvd10gPSB0O1xuICAgICAgICBwWzMgKyByb3ddID0gdDtcbiAgICAgICAgcFs0ICsgcm93XSA9IHQ7XG4gICAgICAgIHBbNSArIHJvd10gPSB0O1xuICAgICAgICBwWzYgKyByb3ddID0gdDtcbiAgICAgICAgcFs3ICsgcm93XSA9IHQ7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBzdGFnZSA0XG4gICAgICB2MCA9IChkY3RTcXJ0MiAqIHBbMCArIHJvd10gKyAxMjgpID4+IDg7XG4gICAgICB2MSA9IChkY3RTcXJ0MiAqIHBbNCArIHJvd10gKyAxMjgpID4+IDg7XG4gICAgICB2MiA9IHBbMiArIHJvd107XG4gICAgICB2MyA9IHBbNiArIHJvd107XG4gICAgICB2NCA9IChkY3RTcXJ0MWQyICogKHBbMSArIHJvd10gLSBwWzcgKyByb3ddKSArIDEyOCkgPj4gODtcbiAgICAgIHY3ID0gKGRjdFNxcnQxZDIgKiAocFsxICsgcm93XSArIHBbNyArIHJvd10pICsgMTI4KSA+PiA4O1xuICAgICAgdjUgPSBwWzMgKyByb3ddIDw8IDQ7XG4gICAgICB2NiA9IHBbNSArIHJvd10gPDwgNDtcblxuICAgICAgLy8gc3RhZ2UgM1xuICAgICAgdCA9ICh2MCAtIHYxICsgMSkgPj4gMTtcbiAgICAgIHYwID0gKHYwICsgdjEgKyAxKSA+PiAxO1xuICAgICAgdjEgPSB0O1xuICAgICAgdCA9ICh2MiAqIGRjdFNpbjYgKyB2MyAqIGRjdENvczYgKyAxMjgpID4+IDg7XG4gICAgICB2MiA9ICh2MiAqIGRjdENvczYgLSB2MyAqIGRjdFNpbjYgKyAxMjgpID4+IDg7XG4gICAgICB2MyA9IHQ7XG4gICAgICB0ID0gKHY0IC0gdjYgKyAxKSA+PiAxO1xuICAgICAgdjQgPSAodjQgKyB2NiArIDEpID4+IDE7XG4gICAgICB2NiA9IHQ7XG4gICAgICB0ID0gKHY3ICsgdjUgKyAxKSA+PiAxO1xuICAgICAgdjUgPSAodjcgLSB2NSArIDEpID4+IDE7XG4gICAgICB2NyA9IHQ7XG5cbiAgICAgIC8vIHN0YWdlIDJcbiAgICAgIHQgPSAodjAgLSB2MyArIDEpID4+IDE7XG4gICAgICB2MCA9ICh2MCArIHYzICsgMSkgPj4gMTtcbiAgICAgIHYzID0gdDtcbiAgICAgIHQgPSAodjEgLSB2MiArIDEpID4+IDE7XG4gICAgICB2MSA9ICh2MSArIHYyICsgMSkgPj4gMTtcbiAgICAgIHYyID0gdDtcbiAgICAgIHQgPSAodjQgKiBkY3RTaW4zICsgdjcgKiBkY3RDb3MzICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NCA9ICh2NCAqIGRjdENvczMgLSB2NyAqIGRjdFNpbjMgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY3ID0gdDtcbiAgICAgIHQgPSAodjUgKiBkY3RTaW4xICsgdjYgKiBkY3RDb3MxICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NSA9ICh2NSAqIGRjdENvczEgLSB2NiAqIGRjdFNpbjEgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY2ID0gdDtcblxuICAgICAgLy8gc3RhZ2UgMVxuICAgICAgcFswICsgcm93XSA9IHYwICsgdjc7XG4gICAgICBwWzcgKyByb3ddID0gdjAgLSB2NztcbiAgICAgIHBbMSArIHJvd10gPSB2MSArIHY2O1xuICAgICAgcFs2ICsgcm93XSA9IHYxIC0gdjY7XG4gICAgICBwWzIgKyByb3ddID0gdjIgKyB2NTtcbiAgICAgIHBbNSArIHJvd10gPSB2MiAtIHY1O1xuICAgICAgcFszICsgcm93XSA9IHYzICsgdjQ7XG4gICAgICBwWzQgKyByb3ddID0gdjMgLSB2NDtcbiAgICB9XG5cbiAgICAvLyBpbnZlcnNlIERDVCBvbiBjb2x1bW5zXG4gICAgZm9yIChpID0gMDsgaSA8IDg7ICsraSkge1xuICAgICAgdmFyIGNvbCA9IGk7XG5cbiAgICAgIC8vIGNoZWNrIGZvciBhbGwtemVybyBBQyBjb2VmZmljaWVudHNcbiAgICAgIGlmIChwWzEgKiA4ICsgY29sXSA9PSAwICYmIHBbMiAqIDggKyBjb2xdID09IDAgJiYgcFszICogOCArIGNvbF0gPT0gMCAmJlxuICAgICAgICBwWzQgKiA4ICsgY29sXSA9PSAwICYmIHBbNSAqIDggKyBjb2xdID09IDAgJiYgcFs2ICogOCArIGNvbF0gPT0gMCAmJlxuICAgICAgICBwWzcgKiA4ICsgY29sXSA9PSAwKSB7XG4gICAgICAgIHQgPSAoZGN0U3FydDIgKiBkYXRhSW5baSArIDBdICsgODE5MikgPj4gMTQ7XG4gICAgICAgIHBbMCAqIDggKyBjb2xdID0gdDtcbiAgICAgICAgcFsxICogOCArIGNvbF0gPSB0O1xuICAgICAgICBwWzIgKiA4ICsgY29sXSA9IHQ7XG4gICAgICAgIHBbMyAqIDggKyBjb2xdID0gdDtcbiAgICAgICAgcFs0ICogOCArIGNvbF0gPSB0O1xuICAgICAgICBwWzUgKiA4ICsgY29sXSA9IHQ7XG4gICAgICAgIHBbNiAqIDggKyBjb2xdID0gdDtcbiAgICAgICAgcFs3ICogOCArIGNvbF0gPSB0O1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gc3RhZ2UgNFxuICAgICAgdjAgPSAoZGN0U3FydDIgKiBwWzAgKiA4ICsgY29sXSArIDIwNDgpID4+IDEyO1xuICAgICAgdjEgPSAoZGN0U3FydDIgKiBwWzQgKiA4ICsgY29sXSArIDIwNDgpID4+IDEyO1xuICAgICAgdjIgPSBwWzIgKiA4ICsgY29sXTtcbiAgICAgIHYzID0gcFs2ICogOCArIGNvbF07XG4gICAgICB2NCA9IChkY3RTcXJ0MWQyICogKHBbMSAqIDggKyBjb2xdIC0gcFs3ICogOCArIGNvbF0pICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NyA9IChkY3RTcXJ0MWQyICogKHBbMSAqIDggKyBjb2xdICsgcFs3ICogOCArIGNvbF0pICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NSA9IHBbMyAqIDggKyBjb2xdO1xuICAgICAgdjYgPSBwWzUgKiA4ICsgY29sXTtcblxuICAgICAgLy8gc3RhZ2UgM1xuICAgICAgdCA9ICh2MCAtIHYxICsgMSkgPj4gMTtcbiAgICAgIHYwID0gKHYwICsgdjEgKyAxKSA+PiAxO1xuICAgICAgdjEgPSB0O1xuICAgICAgdCA9ICh2MiAqIGRjdFNpbjYgKyB2MyAqIGRjdENvczYgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHYyID0gKHYyICogZGN0Q29zNiAtIHYzICogZGN0U2luNiArIDIwNDgpID4+IDEyO1xuICAgICAgdjMgPSB0O1xuICAgICAgdCA9ICh2NCAtIHY2ICsgMSkgPj4gMTtcbiAgICAgIHY0ID0gKHY0ICsgdjYgKyAxKSA+PiAxO1xuICAgICAgdjYgPSB0O1xuICAgICAgdCA9ICh2NyArIHY1ICsgMSkgPj4gMTtcbiAgICAgIHY1ID0gKHY3IC0gdjUgKyAxKSA+PiAxO1xuICAgICAgdjcgPSB0O1xuXG4gICAgICAvLyBzdGFnZSAyXG4gICAgICB0ID0gKHYwIC0gdjMgKyAxKSA+PiAxO1xuICAgICAgdjAgPSAodjAgKyB2MyArIDEpID4+IDE7XG4gICAgICB2MyA9IHQ7XG4gICAgICB0ID0gKHYxIC0gdjIgKyAxKSA+PiAxO1xuICAgICAgdjEgPSAodjEgKyB2MiArIDEpID4+IDE7XG4gICAgICB2MiA9IHQ7XG4gICAgICB0ID0gKHY0ICogZGN0U2luMyArIHY3ICogZGN0Q29zMyArIDIwNDgpID4+IDEyO1xuICAgICAgdjQgPSAodjQgKiBkY3RDb3MzIC0gdjcgKiBkY3RTaW4zICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NyA9IHQ7XG4gICAgICB0ID0gKHY1ICogZGN0U2luMSArIHY2ICogZGN0Q29zMSArIDIwNDgpID4+IDEyO1xuICAgICAgdjUgPSAodjUgKiBkY3RDb3MxIC0gdjYgKiBkY3RTaW4xICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NiA9IHQ7XG5cbiAgICAgIC8vIHN0YWdlIDFcbiAgICAgIHBbMCAqIDggKyBjb2xdID0gdjAgKyB2NztcbiAgICAgIHBbNyAqIDggKyBjb2xdID0gdjAgLSB2NztcbiAgICAgIHBbMSAqIDggKyBjb2xdID0gdjEgKyB2NjtcbiAgICAgIHBbNiAqIDggKyBjb2xdID0gdjEgLSB2NjtcbiAgICAgIHBbMiAqIDggKyBjb2xdID0gdjIgKyB2NTtcbiAgICAgIHBbNSAqIDggKyBjb2xdID0gdjIgLSB2NTtcbiAgICAgIHBbMyAqIDggKyBjb2xdID0gdjMgKyB2NDtcbiAgICAgIHBbNCAqIDggKyBjb2xdID0gdjMgLSB2NDtcbiAgICB9XG5cbiAgICAvLyBjb252ZXJ0IHRvIDgtYml0IGludGVnZXJzXG4gICAgZm9yIChpID0gMDsgaSA8IDY0OyArK2kpIHtcbiAgICAgIHZhciBzYW1wbGUgPSAxMjggKyAoKHBbaV0gKyA4KSA+PiA0KTtcbiAgICAgIGRhdGFPdXRbaV0gPSBzYW1wbGUgPCAwID8gMCA6IHNhbXBsZSA+IDB4RkYgPyAweEZGIDogc2FtcGxlO1xuICAgIH1cbiAgfVxuXG4gIEpwZWdJbWFnZS5yZXF1ZXN0TWVtb3J5QWxsb2NhdGlvbihzYW1wbGVzUGVyTGluZSAqIGJsb2Nrc1BlckNvbHVtbiAqIDgpO1xuXG4gIHZhciBpLCBqO1xuICBmb3IgKHZhciBibG9ja1JvdyA9IDA7IGJsb2NrUm93IDwgYmxvY2tzUGVyQ29sdW1uOyBibG9ja1JvdysrKSB7XG4gICAgdmFyIHNjYW5MaW5lID0gYmxvY2tSb3cgPDwgMztcbiAgICBmb3IgKGkgPSAwOyBpIDwgODsgaSsrKVxuICAgICAgbGluZXMucHVzaChuZXcgVWludDhBcnJheShzYW1wbGVzUGVyTGluZSkpO1xuICAgIGZvciAodmFyIGJsb2NrQ29sID0gMDsgYmxvY2tDb2wgPCBibG9ja3NQZXJMaW5lOyBibG9ja0NvbCsrKSB7XG4gICAgICBxdWFudGl6ZUFuZEludmVyc2UoY29tcG9uZW50LmJsb2Nrc1tibG9ja1Jvd11bYmxvY2tDb2xdLCByLCBSKTtcblxuICAgICAgdmFyIG9mZnNldCA9IDAsIHNhbXBsZSA9IGJsb2NrQ29sIDw8IDM7XG4gICAgICBmb3IgKGogPSAwOyBqIDwgODsgaisrKSB7XG4gICAgICAgIHZhciBsaW5lID0gbGluZXNbc2NhbkxpbmUgKyBqXTtcbiAgICAgICAgZm9yIChpID0gMDsgaSA8IDg7IGkrKylcbiAgICAgICAgICBsaW5lW3NhbXBsZSArIGldID0gcltvZmZzZXQrK107XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBsaW5lcztcbn1cblxuZnVuY3Rpb24gY2xhbXBUbzhiaXQoYSkge1xuICByZXR1cm4gYSA8IDAgPyAwIDogYSA+IDI1NSA/IDI1NSA6IGE7XG59XG5cbmNsYXNzIEpwZWdJbWFnZSB7XG4gIHN0YXRpYyB0b3RhbEJ5dGVzQWxsb2NhdGVkID0gMDtcbiAgc3RhdGljIG1heE1lbW9yeVVzYWdlQnl0ZXMgPSAwO1xuXG4gIHN0YXRpYyByZXF1ZXN0TWVtb3J5QWxsb2NhdGlvbihpbmNyZWFzZUFtb3VudCA9IDApIHtcbiAgICB2YXIgdG90YWxNZW1vcnlJbXBhY3RCeXRlcyA9IEpwZWdJbWFnZS50b3RhbEJ5dGVzQWxsb2NhdGVkICsgaW5jcmVhc2VBbW91bnQ7XG4gICAgaWYgKHRvdGFsTWVtb3J5SW1wYWN0Qnl0ZXMgPiBKcGVnSW1hZ2UubWF4TWVtb3J5VXNhZ2VCeXRlcykge1xuICAgICAgdmFyIGV4Y2VlZGVkQW1vdW50ID0gTWF0aC5jZWlsKCh0b3RhbE1lbW9yeUltcGFjdEJ5dGVzIC0gSnBlZ0ltYWdlLm1heE1lbW9yeVVzYWdlQnl0ZXMpIC8gMTAyNCAvIDEwMjQpO1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBtYXhNZW1vcnlVc2FnZUluTUIgbGltaXQgZXhjZWVkZWQgYnkgYXQgbGVhc3QgJHtleGNlZWRlZEFtb3VudH1NQmApO1xuICAgIH1cblxuICAgIEpwZWdJbWFnZS50b3RhbEJ5dGVzQWxsb2NhdGVkID0gdG90YWxNZW1vcnlJbXBhY3RCeXRlcztcbiAgfVxuXG4gIHN0YXRpYyByZXNldE1heE1lbW9yeVVzYWdlKG1heE1lbW9yeVVzYWdlQnl0ZXNfKSB7XG4gICAgSnBlZ0ltYWdlLnRvdGFsQnl0ZXNBbGxvY2F0ZWQgPSAwO1xuICAgIEpwZWdJbWFnZS5tYXhNZW1vcnlVc2FnZUJ5dGVzID0gbWF4TWVtb3J5VXNhZ2VCeXRlc187XG4gIH07XG5cbiAgc3RhdGljIGdldEJ5dGVzQWxsb2NhdGVkKCkge1xuICAgIHJldHVybiBKcGVnSW1hZ2UudG90YWxCeXRlc0FsbG9jYXRlZDtcbiAgfTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLm9wdHMgPSB7fTtcbiAgICB0aGlzLnF1YWxpdHkgPSAwO1xuICB9XG5cbiAgcGFyc2UoZGF0YSkge1xuICAgIHZhciBtYXhSZXNvbHV0aW9uSW5QaXhlbHMgPSB0aGlzLm9wdHMubWF4UmVzb2x1dGlvbkluTVAgKiAxMDAwICogMTAwMDtcbiAgICB2YXIgb2Zmc2V0ID0gMCwgbGVuZ3RoID0gZGF0YS5sZW5ndGg7XG4gICAgZnVuY3Rpb24gcmVhZFVpbnQxNigpIHtcbiAgICAgIHZhciB2YWx1ZSA9IChkYXRhW29mZnNldF0gPDwgOCkgfCBkYXRhW29mZnNldCArIDFdO1xuICAgICAgb2Zmc2V0ICs9IDI7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuICAgIGZ1bmN0aW9uIHJlYWREYXRhQmxvY2soKSB7XG4gICAgICB2YXIgbGVuZ3RoID0gcmVhZFVpbnQxNigpO1xuICAgICAgdmFyIGFycmF5ID0gZGF0YS5zdWJhcnJheShvZmZzZXQsIG9mZnNldCArIGxlbmd0aCAtIDIpO1xuICAgICAgb2Zmc2V0ICs9IGFycmF5Lmxlbmd0aDtcbiAgICAgIHJldHVybiBhcnJheTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcHJlcGFyZUNvbXBvbmVudHMoZnJhbWUpIHtcbiAgICAgIHZhciBtYXhIID0gMCwgbWF4ViA9IDA7XG4gICAgICB2YXIgY29tcG9uZW50LCBjb21wb25lbnRJZDtcbiAgICAgIGZvciAoY29tcG9uZW50SWQgaW4gZnJhbWUuY29tcG9uZW50cykge1xuICAgICAgICBpZiAoZnJhbWUuY29tcG9uZW50cy5oYXNPd25Qcm9wZXJ0eShjb21wb25lbnRJZCkpIHtcbiAgICAgICAgICBjb21wb25lbnQgPSBmcmFtZS5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcbiAgICAgICAgICBpZiAobWF4SCA8IGNvbXBvbmVudC5oKSBtYXhIID0gY29tcG9uZW50Lmg7XG4gICAgICAgICAgaWYgKG1heFYgPCBjb21wb25lbnQudikgbWF4ViA9IGNvbXBvbmVudC52O1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICB2YXIgbWN1c1BlckxpbmUgPSBNYXRoLmNlaWwoZnJhbWUuc2FtcGxlc1BlckxpbmUgLyA4IC8gbWF4SCk7XG4gICAgICB2YXIgbWN1c1BlckNvbHVtbiA9IE1hdGguY2VpbChmcmFtZS5zY2FuTGluZXMgLyA4IC8gbWF4Vik7XG4gICAgICBmb3IgKGNvbXBvbmVudElkIGluIGZyYW1lLmNvbXBvbmVudHMpIHtcbiAgICAgICAgaWYgKGZyYW1lLmNvbXBvbmVudHMuaGFzT3duUHJvcGVydHkoY29tcG9uZW50SWQpKSB7XG4gICAgICAgICAgY29tcG9uZW50ID0gZnJhbWUuY29tcG9uZW50c1tjb21wb25lbnRJZF07XG4gICAgICAgICAgdmFyIGJsb2Nrc1BlckxpbmUgPSBNYXRoLmNlaWwoTWF0aC5jZWlsKGZyYW1lLnNhbXBsZXNQZXJMaW5lIC8gOCkgKiBjb21wb25lbnQuaCAvIG1heEgpO1xuICAgICAgICAgIHZhciBibG9ja3NQZXJDb2x1bW4gPSBNYXRoLmNlaWwoTWF0aC5jZWlsKGZyYW1lLnNjYW5MaW5lcyAvIDgpICogY29tcG9uZW50LnYgLyBtYXhWKTtcbiAgICAgICAgICB2YXIgYmxvY2tzUGVyTGluZUZvck1jdSA9IG1jdXNQZXJMaW5lICogY29tcG9uZW50Lmg7XG4gICAgICAgICAgdmFyIGJsb2Nrc1BlckNvbHVtbkZvck1jdSA9IG1jdXNQZXJDb2x1bW4gKiBjb21wb25lbnQudjtcbiAgICAgICAgICB2YXIgYmxvY2tzVG9BbGxvY2F0ZSA9IGJsb2Nrc1BlckNvbHVtbkZvck1jdSAqIGJsb2Nrc1BlckxpbmVGb3JNY3U7XG4gICAgICAgICAgdmFyIGJsb2NrcyA9IFtdO1xuXG4gICAgICAgICAgLy8gRWFjaCBibG9jayBpcyBhIEludDMyQXJyYXkgb2YgbGVuZ3RoIDY0ICg0IHggNjQgPSAyNTYgYnl0ZXMpXG4gICAgICAgICAgSnBlZ0ltYWdlLnJlcXVlc3RNZW1vcnlBbGxvY2F0aW9uKGJsb2Nrc1RvQWxsb2NhdGUgKiAyNTYpO1xuXG4gICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBibG9ja3NQZXJDb2x1bW5Gb3JNY3U7IGkrKykge1xuICAgICAgICAgICAgdmFyIHJvdyA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBibG9ja3NQZXJMaW5lRm9yTWN1OyBqKyspXG4gICAgICAgICAgICAgIHJvdy5wdXNoKG5ldyBJbnQzMkFycmF5KDY0KSk7XG4gICAgICAgICAgICBibG9ja3MucHVzaChyb3cpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb21wb25lbnQuYmxvY2tzUGVyTGluZSA9IGJsb2Nrc1BlckxpbmU7XG4gICAgICAgICAgY29tcG9uZW50LmJsb2Nrc1BlckNvbHVtbiA9IGJsb2Nrc1BlckNvbHVtbjtcbiAgICAgICAgICBjb21wb25lbnQuYmxvY2tzID0gYmxvY2tzO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBmcmFtZS5tYXhIID0gbWF4SDtcbiAgICAgIGZyYW1lLm1heFYgPSBtYXhWO1xuICAgICAgZnJhbWUubWN1c1BlckxpbmUgPSBtY3VzUGVyTGluZTtcbiAgICAgIGZyYW1lLm1jdXNQZXJDb2x1bW4gPSBtY3VzUGVyQ29sdW1uO1xuICAgIH1cbiAgICB2YXIgamZpZiA9IG51bGw7XG4gICAgdmFyIGFkb2JlID0gbnVsbDtcbiAgICB2YXIgcGl4ZWxzID0gbnVsbDtcbiAgICB2YXIgZnJhbWUsIHJlc2V0SW50ZXJ2YWw7XG4gICAgdmFyIHF1YW50aXphdGlvblRhYmxlcyA9IFtdLCBmcmFtZXMgPSBbXTtcbiAgICB2YXIgaHVmZm1hblRhYmxlc0FDID0gW10sIGh1ZmZtYW5UYWJsZXNEQyA9IFtdO1xuICAgIHZhciBmaWxlTWFya2VyID0gcmVhZFVpbnQxNigpO1xuICAgIHZhciBtYWxmb3JtZWREYXRhT2Zmc2V0ID0gLTE7XG4gICAgdGhpcy5jb21tZW50cyA9IFtdO1xuICAgIGlmIChmaWxlTWFya2VyICE9IDB4RkZEOCkgeyAvLyBTT0kgKFN0YXJ0IG9mIEltYWdlKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwiU09JIG5vdCBmb3VuZFwiKTtcbiAgICB9XG5cbiAgICBmaWxlTWFya2VyID0gcmVhZFVpbnQxNigpO1xuICAgIHdoaWxlIChmaWxlTWFya2VyICE9IDB4RkZEOSkgeyAvLyBFT0kgKEVuZCBvZiBpbWFnZSlcbiAgICAgIHZhciBpLCBqLCBsO1xuICAgICAgc3dpdGNoIChmaWxlTWFya2VyKSB7XG4gICAgICAgIGNhc2UgMHhGRjAwOiBicmVhaztcbiAgICAgICAgY2FzZSAweEZGRTA6IC8vIEFQUDAgKEFwcGxpY2F0aW9uIFNwZWNpZmljKVxuICAgICAgICBjYXNlIDB4RkZFMTogLy8gQVBQMVxuICAgICAgICBjYXNlIDB4RkZFMjogLy8gQVBQMlxuICAgICAgICBjYXNlIDB4RkZFMzogLy8gQVBQM1xuICAgICAgICBjYXNlIDB4RkZFNDogLy8gQVBQNFxuICAgICAgICBjYXNlIDB4RkZFNTogLy8gQVBQNVxuICAgICAgICBjYXNlIDB4RkZFNjogLy8gQVBQNlxuICAgICAgICBjYXNlIDB4RkZFNzogLy8gQVBQN1xuICAgICAgICBjYXNlIDB4RkZFODogLy8gQVBQOFxuICAgICAgICBjYXNlIDB4RkZFOTogLy8gQVBQOVxuICAgICAgICBjYXNlIDB4RkZFQTogLy8gQVBQMTBcbiAgICAgICAgY2FzZSAweEZGRUI6IC8vIEFQUDExXG4gICAgICAgIGNhc2UgMHhGRkVDOiAvLyBBUFAxMlxuICAgICAgICBjYXNlIDB4RkZFRDogLy8gQVBQMTNcbiAgICAgICAgY2FzZSAweEZGRUU6IC8vIEFQUDE0XG4gICAgICAgIGNhc2UgMHhGRkVGOiAvLyBBUFAxNVxuICAgICAgICBjYXNlIDB4RkZGRTogLy8gQ09NIChDb21tZW50KVxuICAgICAgICAgIHZhciBhcHBEYXRhID0gcmVhZERhdGFCbG9jaygpO1xuXG4gICAgICAgICAgaWYgKGZpbGVNYXJrZXIgPT09IDB4RkZGRSkge1xuICAgICAgICAgICAgdmFyIGNvbW1lbnQgPSBTdHJpbmcuZnJvbUNoYXJDb2RlLmFwcGx5KG51bGwsIGFwcERhdGEpO1xuICAgICAgICAgICAgdGhpcy5jb21tZW50cy5wdXNoKGNvbW1lbnQpO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChmaWxlTWFya2VyID09PSAweEZGRTApIHtcbiAgICAgICAgICAgIGlmIChhcHBEYXRhWzBdID09PSAweDRBICYmIGFwcERhdGFbMV0gPT09IDB4NDYgJiYgYXBwRGF0YVsyXSA9PT0gMHg0OSAmJlxuICAgICAgICAgICAgICBhcHBEYXRhWzNdID09PSAweDQ2ICYmIGFwcERhdGFbNF0gPT09IDApIHsgLy8gJ0pGSUZcXHgwMCdcbiAgICAgICAgICAgICAgamZpZiA9IHtcbiAgICAgICAgICAgICAgICB2ZXJzaW9uOiB7IG1ham9yOiBhcHBEYXRhWzVdLCBtaW5vcjogYXBwRGF0YVs2XSB9LFxuICAgICAgICAgICAgICAgIGRlbnNpdHlVbml0czogYXBwRGF0YVs3XSxcbiAgICAgICAgICAgICAgICB4RGVuc2l0eTogKGFwcERhdGFbOF0gPDwgOCkgfCBhcHBEYXRhWzldLFxuICAgICAgICAgICAgICAgIHlEZW5zaXR5OiAoYXBwRGF0YVsxMF0gPDwgOCkgfCBhcHBEYXRhWzExXSxcbiAgICAgICAgICAgICAgICB0aHVtYldpZHRoOiBhcHBEYXRhWzEyXSxcbiAgICAgICAgICAgICAgICB0aHVtYkhlaWdodDogYXBwRGF0YVsxM10sXG4gICAgICAgICAgICAgICAgdGh1bWJEYXRhOiBhcHBEYXRhLnN1YmFycmF5KDE0LCAxNCArIDMgKiBhcHBEYXRhWzEyXSAqIGFwcERhdGFbMTNdKVxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBUT0RPIEFQUDEgLSBFeGlmXG4gICAgICAgICAgaWYgKGZpbGVNYXJrZXIgPT09IDB4RkZFMSkge1xuICAgICAgICAgICAgaWYgKGFwcERhdGFbMF0gPT09IDB4NDUgJiZcbiAgICAgICAgICAgICAgYXBwRGF0YVsxXSA9PT0gMHg3OCAmJlxuICAgICAgICAgICAgICBhcHBEYXRhWzJdID09PSAweDY5ICYmXG4gICAgICAgICAgICAgIGFwcERhdGFbM10gPT09IDB4NjYgJiZcbiAgICAgICAgICAgICAgYXBwRGF0YVs0XSA9PT0gMCkgeyAvLyAnRVhJRlxceDAwJ1xuICAgICAgICAgICAgICB0aGlzLmV4aWZCdWZmZXIgPSBhcHBEYXRhLnN1YmFycmF5KDUsIGFwcERhdGEubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoZmlsZU1hcmtlciA9PT0gMHhGRkVFKSB7XG4gICAgICAgICAgICBpZiAoYXBwRGF0YVswXSA9PT0gMHg0MSAmJiBhcHBEYXRhWzFdID09PSAweDY0ICYmIGFwcERhdGFbMl0gPT09IDB4NkYgJiZcbiAgICAgICAgICAgICAgYXBwRGF0YVszXSA9PT0gMHg2MiAmJiBhcHBEYXRhWzRdID09PSAweDY1ICYmIGFwcERhdGFbNV0gPT09IDApIHsgLy8gJ0Fkb2JlXFx4MDAnXG4gICAgICAgICAgICAgIGFkb2JlID0ge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IGFwcERhdGFbNl0sXG4gICAgICAgICAgICAgICAgZmxhZ3MwOiAoYXBwRGF0YVs3XSA8PCA4KSB8IGFwcERhdGFbOF0sXG4gICAgICAgICAgICAgICAgZmxhZ3MxOiAoYXBwRGF0YVs5XSA8PCA4KSB8IGFwcERhdGFbMTBdLFxuICAgICAgICAgICAgICAgIHRyYW5zZm9ybUNvZGU6IGFwcERhdGFbMTFdXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgMHhGRkRCOiAvLyBEUVQgKERlZmluZSBRdWFudGl6YXRpb24gVGFibGVzKVxuICAgICAgICAgIHZhciBxdWFudGl6YXRpb25UYWJsZXNMZW5ndGggPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgdmFyIHF1YW50aXphdGlvblRhYmxlc0VuZCA9IHF1YW50aXphdGlvblRhYmxlc0xlbmd0aCArIG9mZnNldCAtIDI7XG4gICAgICAgICAgd2hpbGUgKG9mZnNldCA8IHF1YW50aXphdGlvblRhYmxlc0VuZCkge1xuICAgICAgICAgICAgdmFyIHF1YW50aXphdGlvblRhYmxlU3BlYyA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgICAgSnBlZ0ltYWdlLnJlcXVlc3RNZW1vcnlBbGxvY2F0aW9uKDY0ICogNCk7XG4gICAgICAgICAgICB2YXIgdGFibGVEYXRhID0gbmV3IEludDMyQXJyYXkoNjQpO1xuICAgICAgICAgICAgaWYgKChxdWFudGl6YXRpb25UYWJsZVNwZWMgPj4gNCkgPT09IDApIHsgLy8gOCBiaXQgdmFsdWVzXG4gICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCA2NDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHogPSBkY3RaaWdaYWdbal07XG4gICAgICAgICAgICAgICAgdGFibGVEYXRhW3pdID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSBpZiAoKHF1YW50aXphdGlvblRhYmxlU3BlYyA+PiA0KSA9PT0gMSkgeyAvLzE2IGJpdFxuICAgICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgNjQ7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciB6ID0gZGN0WmlnWmFnW2pdO1xuICAgICAgICAgICAgICAgIHRhYmxlRGF0YVt6XSA9IHJlYWRVaW50MTYoKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlXG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkRRVDogaW52YWxpZCB0YWJsZSBzcGVjXCIpO1xuICAgICAgICAgICAgcXVhbnRpemF0aW9uVGFibGVzW3F1YW50aXphdGlvblRhYmxlU3BlYyAmIDE1XSA9IHRhYmxlRGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAweEZGQzA6IC8vIFNPRjAgKFN0YXJ0IG9mIEZyYW1lLCBCYXNlbGluZSBEQ1QpXG4gICAgICAgIGNhc2UgMHhGRkMxOiAvLyBTT0YxIChTdGFydCBvZiBGcmFtZSwgRXh0ZW5kZWQgRENUKVxuICAgICAgICBjYXNlIDB4RkZDMjogLy8gU09GMiAoU3RhcnQgb2YgRnJhbWUsIFByb2dyZXNzaXZlIERDVClcbiAgICAgICAgICByZWFkVWludDE2KCk7IC8vIHNraXAgZGF0YSBsZW5ndGhcbiAgICAgICAgICBmcmFtZSA9IHt9O1xuICAgICAgICAgIGZyYW1lLmV4dGVuZGVkID0gKGZpbGVNYXJrZXIgPT09IDB4RkZDMSk7XG4gICAgICAgICAgZnJhbWUucHJvZ3Jlc3NpdmUgPSAoZmlsZU1hcmtlciA9PT0gMHhGRkMyKTtcbiAgICAgICAgICBmcmFtZS5wcmVjaXNpb24gPSBkYXRhW29mZnNldCsrXTtcbiAgICAgICAgICBmcmFtZS5zY2FuTGluZXMgPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgZnJhbWUuc2FtcGxlc1BlckxpbmUgPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgZnJhbWUuY29tcG9uZW50cyA9IHt9O1xuICAgICAgICAgIGZyYW1lLmNvbXBvbmVudHNPcmRlciA9IFtdO1xuXG4gICAgICAgICAgdmFyIHBpeGVsc0luRnJhbWUgPSBmcmFtZS5zY2FuTGluZXMgKiBmcmFtZS5zYW1wbGVzUGVyTGluZTtcbiAgICAgICAgICBpZiAocGl4ZWxzSW5GcmFtZSA+IG1heFJlc29sdXRpb25JblBpeGVscykge1xuICAgICAgICAgICAgdmFyIGV4Y2VlZGVkQW1vdW50ID0gTWF0aC5jZWlsKChwaXhlbHNJbkZyYW1lIC0gbWF4UmVzb2x1dGlvbkluUGl4ZWxzKSAvIDFlNik7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYG1heFJlc29sdXRpb25Jbk1QIGxpbWl0IGV4Y2VlZGVkIGJ5ICR7ZXhjZWVkZWRBbW91bnR9TVBgKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2YXIgY29tcG9uZW50c0NvdW50ID0gZGF0YVtvZmZzZXQrK10sIGNvbXBvbmVudElkO1xuICAgICAgICAgIHZhciBtYXhIID0gMCwgbWF4ViA9IDA7XG4gICAgICAgICAgZm9yIChpID0gMDsgaSA8IGNvbXBvbmVudHNDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb21wb25lbnRJZCA9IGRhdGFbb2Zmc2V0XTtcbiAgICAgICAgICAgIHZhciBoID0gZGF0YVtvZmZzZXQgKyAxXSA+PiA0O1xuICAgICAgICAgICAgdmFyIHYgPSBkYXRhW29mZnNldCArIDFdICYgMTU7XG4gICAgICAgICAgICB2YXIgcUlkID0gZGF0YVtvZmZzZXQgKyAyXTtcbiAgICAgICAgICAgIGZyYW1lLmNvbXBvbmVudHNPcmRlci5wdXNoKGNvbXBvbmVudElkKTtcbiAgICAgICAgICAgIGZyYW1lLmNvbXBvbmVudHNbY29tcG9uZW50SWRdID0ge1xuICAgICAgICAgICAgICBoOiBoLFxuICAgICAgICAgICAgICB2OiB2LFxuICAgICAgICAgICAgICBxdWFudGl6YXRpb25JZHg6IHFJZFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIG9mZnNldCArPSAzO1xuICAgICAgICAgIH1cbiAgICAgICAgICBwcmVwYXJlQ29tcG9uZW50cyhmcmFtZSk7XG4gICAgICAgICAgZnJhbWVzLnB1c2goZnJhbWUpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgMHhGRkM0OiAvLyBESFQgKERlZmluZSBIdWZmbWFuIFRhYmxlcylcbiAgICAgICAgICB2YXIgaHVmZm1hbkxlbmd0aCA9IHJlYWRVaW50MTYoKTtcbiAgICAgICAgICBmb3IgKGkgPSAyOyBpIDwgaHVmZm1hbkxlbmd0aDspIHtcbiAgICAgICAgICAgIHZhciBodWZmbWFuVGFibGVTcGVjID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgICB2YXIgY29kZUxlbmd0aHMgPSBuZXcgVWludDhBcnJheSgxNik7XG4gICAgICAgICAgICB2YXIgY29kZUxlbmd0aFN1bSA9IDA7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgMTY7IGorKywgb2Zmc2V0KyspIHtcbiAgICAgICAgICAgICAgY29kZUxlbmd0aFN1bSArPSAoY29kZUxlbmd0aHNbal0gPSBkYXRhW29mZnNldF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgSnBlZ0ltYWdlLnJlcXVlc3RNZW1vcnlBbGxvY2F0aW9uKDE2ICsgY29kZUxlbmd0aFN1bSk7XG4gICAgICAgICAgICB2YXIgaHVmZm1hblZhbHVlcyA9IG5ldyBVaW50OEFycmF5KGNvZGVMZW5ndGhTdW0pO1xuICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IGNvZGVMZW5ndGhTdW07IGorKywgb2Zmc2V0KyspXG4gICAgICAgICAgICAgIGh1ZmZtYW5WYWx1ZXNbal0gPSBkYXRhW29mZnNldF07XG4gICAgICAgICAgICBpICs9IDE3ICsgY29kZUxlbmd0aFN1bTtcblxuICAgICAgICAgICAgKChodWZmbWFuVGFibGVTcGVjID4+IDQpID09PSAwID9cbiAgICAgICAgICAgICAgaHVmZm1hblRhYmxlc0RDIDogaHVmZm1hblRhYmxlc0FDKVtodWZmbWFuVGFibGVTcGVjICYgMTVdID1cbiAgICAgICAgICAgICAgYnVpbGRIdWZmbWFuVGFibGUoY29kZUxlbmd0aHMsIGh1ZmZtYW5WYWx1ZXMpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIDB4RkZERDogLy8gRFJJIChEZWZpbmUgUmVzdGFydCBJbnRlcnZhbClcbiAgICAgICAgICByZWFkVWludDE2KCk7IC8vIHNraXAgZGF0YSBsZW5ndGhcbiAgICAgICAgICByZXNldEludGVydmFsID0gcmVhZFVpbnQxNigpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgMHhGRkRDOiAvLyBOdW1iZXIgb2YgTGluZXMgbWFya2VyXG4gICAgICAgICAgcmVhZFVpbnQxNigpIC8vIHNraXAgZGF0YSBsZW5ndGhcbiAgICAgICAgICByZWFkVWludDE2KCkgLy8gSWdub3JlIHRoaXMgZGF0YSBzaW5jZSBpdCByZXByZXNlbnRzIHRoZSBpbWFnZSBoZWlnaHRcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIDB4RkZEQTogLy8gU09TIChTdGFydCBvZiBTY2FuKVxuICAgICAgICAgIHZhciBzY2FuTGVuZ3RoID0gcmVhZFVpbnQxNigpO1xuICAgICAgICAgIHZhciBzZWxlY3RvcnNDb3VudCA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgIHZhciBjb21wb25lbnRzID0gW10sIGNvbXBvbmVudDtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgc2VsZWN0b3JzQ291bnQ7IGkrKykge1xuICAgICAgICAgICAgY29tcG9uZW50ID0gZnJhbWUuY29tcG9uZW50c1tkYXRhW29mZnNldCsrXV07XG4gICAgICAgICAgICB2YXIgdGFibGVTcGVjID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgICBjb21wb25lbnQuaHVmZm1hblRhYmxlREMgPSBodWZmbWFuVGFibGVzRENbdGFibGVTcGVjID4+IDRdO1xuICAgICAgICAgICAgY29tcG9uZW50Lmh1ZmZtYW5UYWJsZUFDID0gaHVmZm1hblRhYmxlc0FDW3RhYmxlU3BlYyAmIDE1XTtcbiAgICAgICAgICAgIGNvbXBvbmVudHMucHVzaChjb21wb25lbnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgICB2YXIgc3BlY3RyYWxTdGFydCA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgIHZhciBzcGVjdHJhbEVuZCA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgIHZhciBzdWNjZXNzaXZlQXBwcm94aW1hdGlvbiA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgIHZhciBwcm9jZXNzZWQgPSBkZWNvZGVTY2FuKGRhdGEsIG9mZnNldCxcbiAgICAgICAgICAgIGZyYW1lLCBjb21wb25lbnRzLCByZXNldEludGVydmFsLFxuICAgICAgICAgICAgc3BlY3RyYWxTdGFydCwgc3BlY3RyYWxFbmQsXG4gICAgICAgICAgICBzdWNjZXNzaXZlQXBwcm94aW1hdGlvbiA+PiA0LCBzdWNjZXNzaXZlQXBwcm94aW1hdGlvbiAmIDE1LCB0aGlzLm9wdHMpO1xuICAgICAgICAgIG9mZnNldCArPSBwcm9jZXNzZWQ7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAweEZGRkY6IC8vIEZpbGwgYnl0ZXNcbiAgICAgICAgICBpZiAoZGF0YVtvZmZzZXRdICE9PSAweEZGKSB7IC8vIEF2b2lkIHNraXBwaW5nIGEgdmFsaWQgbWFya2VyLlxuICAgICAgICAgICAgb2Zmc2V0LS07XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgIGlmIChkYXRhW29mZnNldCAtIDNdID09IDB4RkYgJiZcbiAgICAgICAgICAgIGRhdGFbb2Zmc2V0IC0gMl0gPj0gMHhDMCAmJiBkYXRhW29mZnNldCAtIDJdIDw9IDB4RkUpIHtcbiAgICAgICAgICAgIC8vIGNvdWxkIGJlIGluY29ycmVjdCBlbmNvZGluZyAtLSBsYXN0IDB4RkYgYnl0ZSBvZiB0aGUgcHJldmlvdXNcbiAgICAgICAgICAgIC8vIGJsb2NrIHdhcyBlYXRlbiBieSB0aGUgZW5jb2RlclxuICAgICAgICAgICAgb2Zmc2V0IC09IDM7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgICAgZWxzZSBpZiAoZmlsZU1hcmtlciA9PT0gMHhFMCB8fCBmaWxlTWFya2VyID09IDB4RTEpIHtcbiAgICAgICAgICAgIC8vIFJlY292ZXIgZnJvbSBtYWxmb3JtZWQgQVBQMSBtYXJrZXJzIHBvcHVsYXIgaW4gc29tZSBwaG9uZSBtb2RlbHMuXG4gICAgICAgICAgICAvLyBTZWUgaHR0cHM6Ly9naXRodWIuY29tL2V1Z2VuZXdhcmUvanBlZy1qcy9pc3N1ZXMvODJcbiAgICAgICAgICAgIGlmIChtYWxmb3JtZWREYXRhT2Zmc2V0ICE9PSAtMSkge1xuICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYGZpcnN0IHVua25vd24gSlBFRyBtYXJrZXIgYXQgb2Zmc2V0ICR7bWFsZm9ybWVkRGF0YU9mZnNldC50b1N0cmluZygxNil9LCBzZWNvbmQgdW5rbm93biBKUEVHIG1hcmtlciAke2ZpbGVNYXJrZXIudG9TdHJpbmcoMTYpfSBhdCBvZmZzZXQgJHsob2Zmc2V0IC0gMSkudG9TdHJpbmcoMTYpfWApO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgbWFsZm9ybWVkRGF0YU9mZnNldCA9IG9mZnNldCAtIDE7XG4gICAgICAgICAgICBjb25zdCBuZXh0T2Zmc2V0ID0gcmVhZFVpbnQxNigpO1xuICAgICAgICAgICAgaWYgKGRhdGFbb2Zmc2V0ICsgbmV4dE9mZnNldCAtIDJdID09PSAweEZGKSB7XG4gICAgICAgICAgICAgIG9mZnNldCArPSBuZXh0T2Zmc2V0IC0gMjtcbiAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcInVua25vd24gSlBFRyBtYXJrZXIgXCIgKyBmaWxlTWFya2VyLnRvU3RyaW5nKDE2KSk7XG4gICAgICB9XG4gICAgICBmaWxlTWFya2VyID0gcmVhZFVpbnQxNigpO1xuICAgIH1cbiAgICBpZiAoZnJhbWVzLmxlbmd0aCAhPSAxKVxuICAgICAgdGhyb3cgbmV3IEVycm9yKFwib25seSBzaW5nbGUgZnJhbWUgSlBFR3Mgc3VwcG9ydGVkXCIpO1xuXG4gICAgLy8gc2V0IGVhY2ggZnJhbWUncyBjb21wb25lbnRzIHF1YW50aXphdGlvbiB0YWJsZVxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZnJhbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICB2YXIgY3AgPSBmcmFtZXNbaV0uY29tcG9uZW50cztcbiAgICAgIGZvciAodmFyIGogaW4gY3ApIHtcbiAgICAgICAgY3Bbal0ucXVhbnRpemF0aW9uVGFibGUgPSBxdWFudGl6YXRpb25UYWJsZXNbY3Bbal0ucXVhbnRpemF0aW9uSWR4XTtcbiAgICAgICAgZGVsZXRlIGNwW2pdLnF1YW50aXphdGlvbklkeDtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aGlzLndpZHRoID0gZnJhbWUuc2FtcGxlc1BlckxpbmU7XG4gICAgdGhpcy5oZWlnaHQgPSBmcmFtZS5zY2FuTGluZXM7XG4gICAgdGhpcy5qZmlmID0gamZpZjtcbiAgICB0aGlzLmFkb2JlID0gYWRvYmU7XG4gICAgdGhpcy5jb21wb25lbnRzID0gW107XG4gICAgLy8gZm9yICh2YXIgaSA9IDA7IGkgPCBmcmFtZS5jb21wb25lbnRzT3JkZXIubGVuZ3RoOyBpKyspIHtcbiAgICAvLyAgIHZhciBjb21wb25lbnQgPSBmcmFtZS5jb21wb25lbnRzW2ZyYW1lLmNvbXBvbmVudHNPcmRlcltpXV07XG4gICAgLy8gICB0aGlzLmNvbXBvbmVudHMucHVzaCh7XG4gICAgLy8gICAgIGxpbmVzOiBidWlsZENvbXBvbmVudERhdGEoZnJhbWUsIGNvbXBvbmVudCksXG4gICAgLy8gICAgIHNjYWxlWDogY29tcG9uZW50LmggLyBmcmFtZS5tYXhILFxuICAgIC8vICAgICBzY2FsZVk6IGNvbXBvbmVudC52IC8gZnJhbWUubWF4VlxuICAgIC8vICAgfSk7XG4gICAgLy8gfVxuXG4gICAgdGhpcy5xdWFsaXR5ID0gMDtcblxuICAgIGxldCBzdW0gPSAwO1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgcXVhbnRpemF0aW9uVGFibGVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBxdGFibGUgPSBxdWFudGl6YXRpb25UYWJsZXNbaV07XG4gICAgICBpZiAocXRhYmxlKSB7XG4gICAgICAgIGZvciAobGV0IGogPSAwOyBqIDwgcXRhYmxlLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgc3VtICs9IHF0YWJsZVtqXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChxdWFudGl6YXRpb25UYWJsZXNbMF0gJiYgcXVhbnRpemF0aW9uVGFibGVzWzFdKSB7XG4gICAgICBjb25zdCBoYXNoID0gW1xuICAgICAgICAxMDIwLCAxMDE1LCA5MzIsIDg0OCwgNzgwLCA3MzUsIDcwMiwgNjc5LCA2NjAsIDY0NSxcbiAgICAgICAgNjMyLCA2MjMsIDYxMywgNjA3LCA2MDAsIDU5NCwgNTg5LCA1ODUsIDU4MSwgNTcxLFxuICAgICAgICA1NTUsIDU0MiwgNTI5LCA1MTQsIDQ5NCwgNDc0LCA0NTcsIDQzOSwgNDI0LCA0MTAsXG4gICAgICAgIDM5NywgMzg2LCAzNzMsIDM2NCwgMzUxLCAzNDEsIDMzNCwgMzI0LCAzMTcsIDMwOSxcbiAgICAgICAgMjk5LCAyOTQsIDI4NywgMjc5LCAyNzQsIDI2NywgMjYyLCAyNTcsIDI1MSwgMjQ3LFxuICAgICAgICAyNDMsIDIzNywgMjMyLCAyMjcsIDIyMiwgMjE3LCAyMTMsIDIwNywgMjAyLCAxOTgsXG4gICAgICAgIDE5MiwgMTg4LCAxODMsIDE3NywgMTczLCAxNjgsIDE2MywgMTU3LCAxNTMsIDE0OCxcbiAgICAgICAgMTQzLCAxMzksIDEzMiwgMTI4LCAxMjUsIDExOSwgMTE1LCAxMDgsIDEwNCwgOTksXG4gICAgICAgIDk0LCA5MCwgODQsIDc5LCA3NCwgNzAsIDY0LCA1OSwgNTUsIDQ5LFxuICAgICAgICA0NSwgNDAsIDM0LCAzMCwgMjUsIDIwLCAxNSwgMTEsIDYsIDQsXG4gICAgICAgIDBcbiAgICAgIF07XG4gICAgICBjb25zdCBzdW1zID0gW1xuICAgICAgICAzMjY0MCwgMzI2MzUsIDMyMjY2LCAzMTQ5NSwgMzA2NjUsIDI5ODA0LCAyOTE0NiwgMjg1OTksIDI4MTA0LFxuICAgICAgICAyNzY3MCwgMjcyMjUsIDI2NzI1LCAyNjIxMCwgMjU3MTYsIDI1MjQwLCAyNDc4OSwgMjQzNzMsIDIzOTQ2LFxuICAgICAgICAyMzU3MiwgMjI4NDYsIDIxODAxLCAyMDg0MiwgMTk5NDksIDE5MTIxLCAxODM4NiwgMTc2NTEsIDE2OTk4LFxuICAgICAgICAxNjM0OSwgMTU4MDAsIDE1MjQ3LCAxNDc4MywgMTQzMjEsIDEzODU5LCAxMzUzNSwgMTMwODEsIDEyNzAyLFxuICAgICAgICAxMjQyMywgMTIwNTYsIDExNzc5LCAxMTUxMywgMTExMzUsIDEwOTU1LCAxMDY3NiwgMTAzOTIsIDEwMjA4LFxuICAgICAgICA5OTI4LCA5NzQ3LCA5NTY0LCA5MzY5LCA5MTkzLCA5MDE3LCA4ODIyLCA4NjM5LCA4NDU4LFxuICAgICAgICA4MjcwLCA4MDg0LCA3ODk2LCA3NzEwLCA3NTI3LCA3MzQ3LCA3MTU2LCA2OTc3LCA2Nzg4LFxuICAgICAgICA2NjA3LCA2NDIyLCA2MjM2LCA2MDU0LCA1ODY3LCA1Njg0LCA1NDk1LCA1MzA1LCA1MTI4LFxuICAgICAgICA0OTQ1LCA0NzUxLCA0NjM4LCA0NDQyLCA0MjQ4LCA0MDY1LCAzODg4LCAzNjk4LCAzNTA5LFxuICAgICAgICAzMzI2LCAzMTM5LCAyOTU3LCAyNzc1LCAyNTg2LCAyNDA1LCAyMjE2LCAyMDM3LCAxODQ2LFxuICAgICAgICAxNjY2LCAxNDgzLCAxMjk3LCAxMTA5LCA5MjcsIDczNSwgNTU0LCAzNzUsIDIwMSxcbiAgICAgICAgMTI4LCAwXG4gICAgICBdO1xuICAgICAgY29uc3QgcXZhbHVlID0gKFxuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMF1bMl0gK1xuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMF1bNTNdICtcbiAgICAgICAgcXVhbnRpemF0aW9uVGFibGVzWzFdWzBdICtcbiAgICAgICAgcXVhbnRpemF0aW9uVGFibGVzWzFdWzYzXVxuICAgICAgKTtcblxuICAgICAgZm9yIChpID0gMDsgaSA8IDEwMDsgaSsrKSB7XG4gICAgICAgIGlmICgocXZhbHVlIDwgaGFzaFtpXSkgJiYgKHN1bSA8IHN1bXNbaV0pKSB7IGNvbnRpbnVlOyB9XG4gICAgICAgIGlmICgoKHF2YWx1ZSA8PSBoYXNoW2ldKSAmJiAoc3VtIDw9IHN1bXNbaV0pKSB8fCAoaSA+PSA1MCkpIHtcbiAgICAgICAgICB0aGlzLnF1YWxpdHkgPSBpICsgMTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHF1YW50aXphdGlvblRhYmxlc1swXSkge1xuICAgICAgY29uc3QgaGFzaCA9XG4gICAgICAgIFtcbiAgICAgICAgICA1MTAsIDUwNSwgNDIyLCAzODAsIDM1NSwgMzM4LCAzMjYsIDMxOCwgMzExLCAzMDUsXG4gICAgICAgICAgMzAwLCAyOTcsIDI5MywgMjkxLCAyODgsIDI4NiwgMjg0LCAyODMsIDI4MSwgMjgwLFxuICAgICAgICAgIDI3OSwgMjc4LCAyNzcsIDI3MywgMjYyLCAyNTEsIDI0MywgMjMzLCAyMjUsIDIxOCxcbiAgICAgICAgICAyMTEsIDIwNSwgMTk4LCAxOTMsIDE4NiwgMTgxLCAxNzcsIDE3MiwgMTY4LCAxNjQsXG4gICAgICAgICAgMTU4LCAxNTYsIDE1MiwgMTQ4LCAxNDUsIDE0MiwgMTM5LCAxMzYsIDEzMywgMTMxLFxuICAgICAgICAgIDEyOSwgMTI2LCAxMjMsIDEyMCwgMTE4LCAxMTUsIDExMywgMTEwLCAxMDcsIDEwNSxcbiAgICAgICAgICAxMDIsIDEwMCwgOTcsIDk0LCA5MiwgODksIDg3LCA4MywgODEsIDc5LFxuICAgICAgICAgIDc2LCA3NCwgNzAsIDY4LCA2NiwgNjMsIDYxLCA1NywgNTUsIDUyLFxuICAgICAgICAgIDUwLCA0OCwgNDQsIDQyLCAzOSwgMzcsIDM0LCAzMSwgMjksIDI2LFxuICAgICAgICAgIDI0LCAyMSwgMTgsIDE2LCAxMywgMTEsIDgsIDYsIDMsIDIsXG4gICAgICAgICAgMFxuICAgICAgICBdO1xuICAgICAgY29uc3Qgc3VtcyA9XG4gICAgICAgIFtcbiAgICAgICAgICAxNjMyMCwgMTYzMTUsIDE1OTQ2LCAxNTI3NywgMTQ2NTUsIDE0MDczLCAxMzYyMywgMTMyMzAsIDEyODU5LFxuICAgICAgICAgIDEyNTYwLCAxMjI0MCwgMTE4NjEsIDExNDU2LCAxMTA4MSwgMTA3MTQsIDEwMzYwLCAxMDAyNywgOTY3OSxcbiAgICAgICAgICA5MzY4LCA5MDU2LCA4NjgwLCA4MzMxLCA3OTk1LCA3NjY4LCA3Mzc2LCA3MDg0LCA2ODIzLFxuICAgICAgICAgIDY1NjIsIDYzNDUsIDYxMjUsIDU5MzksIDU3NTYsIDU1NzEsIDU0MjEsIDUyNDAsIDUwODYsXG4gICAgICAgICAgNDk3NiwgNDgyOSwgNDcxOSwgNDYxNiwgNDQ2MywgNDM5MywgNDI4MCwgNDE2NiwgNDA5MixcbiAgICAgICAgICAzOTgwLCAzOTA5LCAzODM1LCAzNzU1LCAzNjg4LCAzNjIxLCAzNTQxLCAzNDY3LCAzMzk2LFxuICAgICAgICAgIDMzMjMsIDMyNDcsIDMxNzAsIDMwOTYsIDMwMjEsIDI5NTIsIDI4NzQsIDI4MDQsIDI3MjcsXG4gICAgICAgICAgMjY1NywgMjU4MywgMjUwOSwgMjQzNywgMjM2MiwgMjI5MCwgMjIxMSwgMjEzNiwgMjA2OCxcbiAgICAgICAgICAxOTk2LCAxOTE1LCAxODU4LCAxNzczLCAxNjkyLCAxNjIwLCAxNTUyLCAxNDc3LCAxMzk4LFxuICAgICAgICAgIDEzMjYsIDEyNTEsIDExNzksIDExMDksIDEwMzEsIDk2MSwgODg0LCA4MTQsIDczNixcbiAgICAgICAgICA2NjcsIDU5MiwgNTE4LCA0NDEsIDM2OSwgMjkyLCAyMjEsIDE1MSwgODYsXG4gICAgICAgICAgNjQsIDBcbiAgICAgICAgXTtcblxuICAgICAgY29uc3QgcXZhbHVlID0gKFxuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMF1bMl0gK1xuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMF1bNTNdXG4gICAgICApO1xuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcbiAgICAgICAgaWYgKChxdmFsdWUgPCBoYXNoW2ldKSAmJiAoc3VtIDwgc3Vtc1tpXSkpIHsgY29udGludWU7IH1cbiAgICAgICAgaWYgKCgocXZhbHVlIDw9IGhhc2hbaV0pICYmIChzdW0gPD0gc3Vtc1tpXSkpIHx8IChpID49IDUwKSkge1xuICAgICAgICAgIHRoaXMucXVhbGl0eSA9IGkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5tb2R1bGUuZXhwb3J0cyA9IHtcbiAgZGVjb2RlXG59O1xuXG5mdW5jdGlvbiBkZWNvZGUoanBlZ0RhdGEsIHVzZXJPcHRzID0ge30pIHtcbiAgdmFyIGRlZmF1bHRPcHRzID0ge1xuICAgIC8vIFwidW5kZWZpbmVkXCIgbWVhbnMgXCJDaG9vc2Ugd2hldGhlciB0byB0cmFuc2Zvcm0gY29sb3JzIGJhc2VkIG9uIHRoZSBpbWFnZeKAmXMgY29sb3IgbW9kZWwuXCJcbiAgICBjb2xvclRyYW5zZm9ybTogdW5kZWZpbmVkLFxuICAgIHVzZVRBcnJheTogZmFsc2UsXG4gICAgZm9ybWF0QXNSR0JBOiB0cnVlLFxuICAgIHRvbGVyYW50RGVjb2Rpbmc6IHRydWUsXG4gICAgbWF4UmVzb2x1dGlvbkluTVA6IDI1MCwgLy8gRG9uJ3QgZGVjb2RlIG1vcmUgdGhhbiAyNTAgbWVnYXBpeGVsc1xuICAgIG1heE1lbW9yeVVzYWdlSW5NQjogNTEyLCAvLyBEb24ndCBkZWNvZGUgaWYgbWVtb3J5IGZvb3RwcmludCBpcyBtb3JlIHRoYW4gNTEyTUJcbiAgfTtcblxuICB2YXIgb3B0cyA9IHsgLi4uZGVmYXVsdE9wdHMsIC4uLnVzZXJPcHRzIH07XG4gIHZhciBhcnIgPSBuZXcgVWludDhBcnJheShqcGVnRGF0YSk7XG4gIHZhciBkZWNvZGVyID0gbmV3IEpwZWdJbWFnZSgpO1xuICBkZWNvZGVyLm9wdHMgPSBvcHRzO1xuICAvLyBJZiB0aGlzIGNvbnN0cnVjdG9yIGV2ZXIgc3VwcG9ydHMgYXN5bmMgZGVjb2RpbmcgdGhpcyB3aWxsIG5lZWQgdG8gYmUgZG9uZSBkaWZmZXJlbnRseS5cbiAgLy8gVW50aWwgdGhlbiwgdHJlYXRpbmcgYXMgc2luZ2xldG9uIGxpbWl0IGlzIGZpbmUuXG4gIEpwZWdJbWFnZS5yZXNldE1heE1lbW9yeVVzYWdlKG9wdHMubWF4TWVtb3J5VXNhZ2VJbk1CICogMTAyNCAqIDEwMjQpO1xuICBkZWNvZGVyLnBhcnNlKGFycik7XG5cbiAgcmV0dXJuIGRlY29kZXJcbn1cbiJdfQ==