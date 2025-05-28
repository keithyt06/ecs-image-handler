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
    constructor() {
        this.opts = {};
        this.quality = 0;
    }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoianBlZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm9jZXNzb3IvaW1hZ2UvanBlZy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiO0FBQUE7bUVBQ21FO0FBQ25FOzs7Ozs7Ozs7Ozs7OztFQWNFO0FBRUYsNkVBQTZFO0FBQzdFLDJDQUEyQztBQUMzQyw0RUFBNEU7QUFDNUUseUNBQXlDO0FBQ3pDLGtGQUFrRjtBQUNsRixnREFBZ0Q7QUFDaEQsd0VBQXdFO0FBRXhFLE1BQU0sU0FBUyxHQUFHLElBQUksVUFBVSxDQUFDO0lBQy9CLENBQUM7SUFDRCxDQUFDLEVBQUUsQ0FBQztJQUNKLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztJQUNSLENBQUMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7SUFDYixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUNqQixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUU7SUFDckIsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsQ0FBQztJQUN6QixDQUFDLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUM3QixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO0lBQzFCLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUN0QixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtJQUNsQixFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO0lBQ2QsRUFBRSxFQUFFLEVBQUUsRUFBRSxF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RyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDbEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsRUFBRTtnQkFDL0MsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRTtnQkFDdEMsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQztnQkFDcEMsQ0FBQzthQUNGLENBQUM7WUFDRixNQUFNLElBQUksR0FBRztnQkFDWCxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7Z0JBQzdELEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSztnQkFDN0QsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLO2dCQUM3RCxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUs7Z0JBQzdELEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSztnQkFDN0QsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDL0MsR0FBRyxFQUFFLENBQUM7YUFDUCxDQUFDO1lBQ0YsTUFBTSxNQUFNLEdBQUcsQ0FDYixrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7Z0JBQ3hCLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQztnQkFDekIsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO2dCQUN4QixrQkFBa0IsQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FDMUIsQ0FBQztZQUVGLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsR0FBRyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUN4QixJQUFJLENBQUMsTUFBTSxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFO29CQUFFLFNBQVM7aUJBQUU7Z0JBQ3hELElBQUksQ0FBQyxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxFQUFFO29CQUMxRCxJQUFJLENBQUMsT0FBTyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7aUJBQ3RCO2dCQUNELE1BQU07YUFDUDtTQUNGO2FBQU0sSUFBSSxrQkFBa0IsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNoQyxNQUFNLElBQUksR0FDUjtnQkFDRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHO2dCQUNoRCxHQUFHLEVBQUUsR0FBRyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO2dCQUN4QyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO2dCQUN0QyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFO2dCQUN0QyxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO2dCQUNsQyxDQUFDO2FBQ0YsQ0FBQztZQUNKLE1BQU0sSUFBSSxHQUNSO2dCQUNFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSztnQkFDN0QsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxJQUFJO2dCQUM1RCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSTtnQkFDcEQsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJO2dCQUNwRCxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUk7Z0JBQ3BELElBQUksRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRztnQkFDaEQsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxHQUFHLEVBQUUsR0FBRyxFQUFFLEdBQUcsRUFBRSxFQUFFO2dCQUMxQyxFQUFFLEVBQUUsQ0FBQzthQUNOLENBQUM7WUFFSixNQUFNLE1BQU0sR0FBRyxDQUNiLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDeEIsa0JBQWtCLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQzFCLENBQUM7WUFFRixLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUFDLEVBQUUsRUFBRTtnQkFDeEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsR0FBRyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtvQkFBRSxTQUFTO2lCQUFFO2dCQUN4RCxJQUFJLENBQUMsQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxFQUFFLENBQUMsRUFBRTtvQkFDMUQsSUFBSSxDQUFDLE9BQU8sR0FBRyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUN0QjtnQkFDRCxNQUFNO2FBQ1A7U0FDRjtJQUNILENBQUM7O0FBN2FNLDZCQUFtQixHQUFHLENBQUMsQ0FBQztBQUN4Qiw2QkFBbUIsR0FBRyxDQUFDLENBQUM7QUErYWpDLE1BQU0sQ0FBQyxPQUFPLEdBQUc7SUFDZixNQUFNO0NBQ1AsQ0FBQztBQUVGLFNBQVMsTUFBTSxDQUFDLFFBQVEsRUFBRSxRQUFRLEdBQUcsRUFBRTtJQUNyQyxJQUFJLFdBQVcsR0FBRztRQUNoQiwyRkFBMkY7UUFDM0YsY0FBYyxFQUFFLFNBQVM7UUFDekIsU0FBUyxFQUFFLEtBQUs7UUFDaEIsWUFBWSxFQUFFLElBQUk7UUFDbEIsZ0JBQWdCLEVBQUUsSUFBSTtRQUN0QixpQkFBaUIsRUFBRSxHQUFHO1FBQ3RCLGtCQUFrQixFQUFFLEdBQUcsRUFBRSxzREFBc0Q7S0FDaEYsQ0FBQztJQUVGLElBQUksSUFBSSxHQUFHLEVBQUUsR0FBRyxXQUFXLEVBQUUsR0FBRyxRQUFRLEVBQUUsQ0FBQztJQUMzQyxJQUFJLEdBQUcsR0FBRyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNuQyxJQUFJLE9BQU8sR0FBRyxJQUFJLFNBQVMsRUFBRSxDQUFDO0lBQzlCLE9BQU8sQ0FBQyxJQUFJLEdBQUcsSUFBSSxDQUFDO0lBQ3BCLDBGQUEwRjtJQUMxRixtREFBbUQ7SUFDbkQsU0FBUyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsSUFBSSxDQUFDLENBQUM7SUFDckUsT0FBTyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztJQUVuQixPQUFPLE9BQU8sQ0FBQTtBQUNoQixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyogLSotIHRhYi13aWR0aDogMjsgaW5kZW50LXRhYnMtbW9kZTogbmlsOyBjLWJhc2ljLW9mZnNldDogMiAtKi0gL1xuLyogdmltOiBzZXQgc2hpZnR3aWR0aD0yIHRhYnN0b3A9MiBhdXRvaW5kZW50IGNpbmRlbnQgZXhwYW5kdGFiOiAqL1xuLypcbiAgIENvcHlyaWdodCAyMDExIG5vdG1hc3RlcnlldFxuXG4gICBMaWNlbnNlZCB1bmRlciB0aGUgQXBhY2hlIExpY2Vuc2UsIFZlcnNpb24gMi4wICh0aGUgXCJMaWNlbnNlXCIpO1xuICAgeW91IG1heSBub3QgdXNlIHRoaXMgZmlsZSBleGNlcHQgaW4gY29tcGxpYW5jZSB3aXRoIHRoZSBMaWNlbnNlLlxuICAgWW91IG1heSBvYnRhaW4gYSBjb3B5IG9mIHRoZSBMaWNlbnNlIGF0XG5cbiAgICAgICBodHRwOi8vd3d3LmFwYWNoZS5vcmcvbGljZW5zZXMvTElDRU5TRS0yLjBcblxuICAgVW5sZXNzIHJlcXVpcmVkIGJ5IGFwcGxpY2FibGUgbGF3IG9yIGFncmVlZCB0byBpbiB3cml0aW5nLCBzb2Z0d2FyZVxuICAgZGlzdHJpYnV0ZWQgdW5kZXIgdGhlIExpY2Vuc2UgaXMgZGlzdHJpYnV0ZWQgb24gYW4gXCJBUyBJU1wiIEJBU0lTLFxuICAgV0lUSE9VVCBXQVJSQU5USUVTIE9SIENPTkRJVElPTlMgT0YgQU5ZIEtJTkQsIGVpdGhlciBleHByZXNzIG9yIGltcGxpZWQuXG4gICBTZWUgdGhlIExpY2Vuc2UgZm9yIHRoZSBzcGVjaWZpYyBsYW5ndWFnZSBnb3Zlcm5pbmcgcGVybWlzc2lvbnMgYW5kXG4gICBsaW1pdGF0aW9ucyB1bmRlciB0aGUgTGljZW5zZS5cbiovXG5cbi8vIC0gVGhlIEpQRUcgc3BlY2lmaWNhdGlvbiBjYW4gYmUgZm91bmQgaW4gdGhlIElUVSBDQ0lUVCBSZWNvbW1lbmRhdGlvbiBULjgxXG4vLyAgICh3d3cudzMub3JnL0dyYXBoaWNzL0pQRUcvaXR1LXQ4MS5wZGYpXG4vLyAtIFRoZSBKRklGIHNwZWNpZmljYXRpb24gY2FuIGJlIGZvdW5kIGluIHRoZSBKUEVHIEZpbGUgSW50ZXJjaGFuZ2UgRm9ybWF0XG4vLyAgICh3d3cudzMub3JnL0dyYXBoaWNzL0pQRUcvamZpZjMucGRmKVxuLy8gLSBUaGUgQWRvYmUgQXBwbGljYXRpb24tU3BlY2lmaWMgSlBFRyBtYXJrZXJzIGluIHRoZSBTdXBwb3J0aW5nIHRoZSBEQ1QgRmlsdGVyc1xuLy8gICBpbiBQb3N0U2NyaXB0IExldmVsIDIsIFRlY2huaWNhbCBOb3RlICM1MTE2XG4vLyAgIChwYXJ0bmVycy5hZG9iZS5jb20vcHVibGljL2RldmVsb3Blci9lbi9wcy9zZGsvNTExNi5EQ1RfRmlsdGVyLnBkZilcblxuY29uc3QgZGN0WmlnWmFnID0gbmV3IEludDMyQXJyYXkoW1xuICAwLFxuICAxLCA4LFxuICAxNiwgOSwgMixcbiAgMywgMTAsIDE3LCAyNCxcbiAgMzIsIDI1LCAxOCwgMTEsIDQsXG4gIDUsIDEyLCAxOSwgMjYsIDMzLCA0MCxcbiAgNDgsIDQxLCAzNCwgMjcsIDIwLCAxMywgNixcbiAgNywgMTQsIDIxLCAyOCwgMzUsIDQyLCA0OSwgNTYsXG4gIDU3LCA1MCwgNDMsIDM2LCAyOSwgMjIsIDE1LFxuICAyMywgMzAsIDM3LCA0NCwgNTEsIDU4LFxuICA1OSwgNTIsIDQ1LCAzOCwgMzEsXG4gIDM5LCA0NiwgNTMsIDYwLFxuICA2MSwgNTQsIDQ3LFxuICA1NSwgNjIsXG4gIDYzXG5dKTtcblxuY29uc3QgZGN0Q29zMSA9IDQwMTcgICAvLyBjb3MocGkvMTYpXG5jb25zdCBkY3RTaW4xID0gNzk5ICAgLy8gc2luKHBpLzE2KVxuY29uc3QgZGN0Q29zMyA9IDM0MDYgICAvLyBjb3MoMypwaS8xNilcbmNvbnN0IGRjdFNpbjMgPSAyMjc2ICAgLy8gc2luKDMqcGkvMTYpXG5jb25zdCBkY3RDb3M2ID0gMTU2NyAgIC8vIGNvcyg2KnBpLzE2KVxuY29uc3QgZGN0U2luNiA9IDM3ODQgICAvLyBzaW4oNipwaS8xNilcbmNvbnN0IGRjdFNxcnQyID0gNTc5MyAgIC8vIHNxcnQoMilcbmNvbnN0IGRjdFNxcnQxZDIgPSAyODk2ICAvLyBzcXJ0KDIpIC8gMlxuXG5mdW5jdGlvbiBidWlsZEh1ZmZtYW5UYWJsZShjb2RlTGVuZ3RocywgdmFsdWVzKSB7XG4gIHZhciBrID0gMCwgY29kZSA9IFtdLCBpLCBqLCBsZW5ndGggPSAxNjtcbiAgd2hpbGUgKGxlbmd0aCA+IDAgJiYgIWNvZGVMZW5ndGhzW2xlbmd0aCAtIDFdKVxuICAgIGxlbmd0aC0tO1xuICBjb2RlLnB1c2goeyBjaGlsZHJlbjogW10sIGluZGV4OiAwIH0pO1xuICB2YXIgcCA9IGNvZGVbMF0sIHE7XG4gIGZvciAoaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgIGZvciAoaiA9IDA7IGogPCBjb2RlTGVuZ3Roc1tpXTsgaisrKSB7XG4gICAgICBwID0gY29kZS5wb3AoKTtcbiAgICAgIHAuY2hpbGRyZW5bcC5pbmRleF0gPSB2YWx1ZXNba107XG4gICAgICB3aGlsZSAocC5pbmRleCA+IDApIHtcbiAgICAgICAgaWYgKGNvZGUubGVuZ3RoID09PSAwKVxuICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ291bGQgbm90IHJlY3JlYXRlIEh1ZmZtYW4gVGFibGUnKTtcbiAgICAgICAgcCA9IGNvZGUucG9wKCk7XG4gICAgICB9XG4gICAgICBwLmluZGV4Kys7XG4gICAgICBjb2RlLnB1c2gocCk7XG4gICAgICB3aGlsZSAoY29kZS5sZW5ndGggPD0gaSkge1xuICAgICAgICBjb2RlLnB1c2gocSA9IHsgY2hpbGRyZW46IFtdLCBpbmRleDogMCB9KTtcbiAgICAgICAgcC5jaGlsZHJlbltwLmluZGV4XSA9IHEuY2hpbGRyZW47XG4gICAgICAgIHAgPSBxO1xuICAgICAgfVxuICAgICAgaysrO1xuICAgIH1cbiAgICBpZiAoaSArIDEgPCBsZW5ndGgpIHtcbiAgICAgIC8vIHAgaGVyZSBwb2ludHMgdG8gbGFzdCBjb2RlXG4gICAgICBjb2RlLnB1c2gocSA9IHsgY2hpbGRyZW46IFtdLCBpbmRleDogMCB9KTtcbiAgICAgIHAuY2hpbGRyZW5bcC5pbmRleF0gPSBxLmNoaWxkcmVuO1xuICAgICAgcCA9IHE7XG4gICAgfVxuICB9XG4gIHJldHVybiBjb2RlWzBdLmNoaWxkcmVuO1xufVxuXG5mdW5jdGlvbiBkZWNvZGVTY2FuKGRhdGEsIG9mZnNldCxcbiAgZnJhbWUsIGNvbXBvbmVudHMsIHJlc2V0SW50ZXJ2YWwsXG4gIHNwZWN0cmFsU3RhcnQsIHNwZWN0cmFsRW5kLFxuICBzdWNjZXNzaXZlUHJldiwgc3VjY2Vzc2l2ZSwgb3B0cykge1xuICB2YXIgcHJlY2lzaW9uID0gZnJhbWUucHJlY2lzaW9uO1xuICB2YXIgc2FtcGxlc1BlckxpbmUgPSBmcmFtZS5zYW1wbGVzUGVyTGluZTtcbiAgdmFyIHNjYW5MaW5lcyA9IGZyYW1lLnNjYW5MaW5lcztcbiAgdmFyIG1jdXNQZXJMaW5lID0gZnJhbWUubWN1c1BlckxpbmU7XG4gIHZhciBwcm9ncmVzc2l2ZSA9IGZyYW1lLnByb2dyZXNzaXZlO1xuICB2YXIgbWF4SCA9IGZyYW1lLm1heEgsIG1heFYgPSBmcmFtZS5tYXhWO1xuXG4gIHZhciBzdGFydE9mZnNldCA9IG9mZnNldCwgYml0c0RhdGEgPSAwLCBiaXRzQ291bnQgPSAwO1xuICBmdW5jdGlvbiByZWFkQml0KCkge1xuICAgIGlmIChiaXRzQ291bnQgPiAwKSB7XG4gICAgICBiaXRzQ291bnQtLTtcbiAgICAgIHJldHVybiAoYml0c0RhdGEgPj4gYml0c0NvdW50KSAmIDE7XG4gICAgfVxuICAgIGJpdHNEYXRhID0gZGF0YVtvZmZzZXQrK107XG4gICAgaWYgKGJpdHNEYXRhID09IDB4RkYpIHtcbiAgICAgIHZhciBuZXh0Qnl0ZSA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgaWYgKG5leHRCeXRlKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcInVuZXhwZWN0ZWQgbWFya2VyOiBcIiArICgoYml0c0RhdGEgPDwgOCkgfCBuZXh0Qnl0ZSkudG9TdHJpbmcoMTYpKTtcbiAgICAgIH1cbiAgICAgIC8vIHVuc3R1ZmYgMFxuICAgIH1cbiAgICBiaXRzQ291bnQgPSA3O1xuICAgIHJldHVybiBiaXRzRGF0YSA+Pj4gNztcbiAgfVxuICBmdW5jdGlvbiBkZWNvZGVIdWZmbWFuKHRyZWUpIHtcbiAgICB2YXIgbm9kZSA9IHRyZWUsIGJpdDtcbiAgICB3aGlsZSAoKGJpdCA9IHJlYWRCaXQoKSkgIT09IG51bGwpIHtcbiAgICAgIG5vZGUgPSBub2RlW2JpdF07XG4gICAgICBpZiAodHlwZW9mIG5vZGUgPT09ICdudW1iZXInKVxuICAgICAgICByZXR1cm4gbm9kZTtcbiAgICAgIGlmICh0eXBlb2Ygbm9kZSAhPT0gJ29iamVjdCcpXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcImludmFsaWQgaHVmZm1hbiBzZXF1ZW5jZVwiKTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgZnVuY3Rpb24gcmVjZWl2ZShsZW5ndGgpIHtcbiAgICB2YXIgbiA9IDA7XG4gICAgd2hpbGUgKGxlbmd0aCA+IDApIHtcbiAgICAgIHZhciBiaXQgPSByZWFkQml0KCk7XG4gICAgICBpZiAoYml0ID09PSBudWxsKSByZXR1cm47XG4gICAgICBuID0gKG4gPDwgMSkgfCBiaXQ7XG4gICAgICBsZW5ndGgtLTtcbiAgICB9XG4gICAgcmV0dXJuIG47XG4gIH1cbiAgZnVuY3Rpb24gcmVjZWl2ZUFuZEV4dGVuZChsZW5ndGgpIHtcbiAgICB2YXIgbiA9IHJlY2VpdmUobGVuZ3RoKTtcbiAgICBpZiAobiA+PSAxIDw8IChsZW5ndGggLSAxKSlcbiAgICAgIHJldHVybiBuO1xuICAgIHJldHVybiBuICsgKC0xIDw8IGxlbmd0aCkgKyAxO1xuICB9XG4gIGZ1bmN0aW9uIGRlY29kZUJhc2VsaW5lKGNvbXBvbmVudCwgenopIHtcbiAgICB2YXIgdCA9IGRlY29kZUh1ZmZtYW4oY29tcG9uZW50Lmh1ZmZtYW5UYWJsZURDKTtcbiAgICB2YXIgZGlmZiA9IHQgPT09IDAgPyAwIDogcmVjZWl2ZUFuZEV4dGVuZCh0KTtcbiAgICB6elswXSA9IChjb21wb25lbnQucHJlZCArPSBkaWZmKTtcbiAgICB2YXIgayA9IDE7XG4gICAgd2hpbGUgKGsgPCA2NCkge1xuICAgICAgdmFyIHJzID0gZGVjb2RlSHVmZm1hbihjb21wb25lbnQuaHVmZm1hblRhYmxlQUMpO1xuICAgICAgdmFyIHMgPSBycyAmIDE1LCByID0gcnMgPj4gNDtcbiAgICAgIGlmIChzID09PSAwKSB7XG4gICAgICAgIGlmIChyIDwgMTUpXG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGsgKz0gMTY7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgayArPSByO1xuICAgICAgdmFyIHogPSBkY3RaaWdaYWdba107XG4gICAgICB6elt6XSA9IHJlY2VpdmVBbmRFeHRlbmQocyk7XG4gICAgICBrKys7XG4gICAgfVxuICB9XG4gIGZ1bmN0aW9uIGRlY29kZURDRmlyc3QoY29tcG9uZW50LCB6eikge1xuICAgIHZhciB0ID0gZGVjb2RlSHVmZm1hbihjb21wb25lbnQuaHVmZm1hblRhYmxlREMpO1xuICAgIHZhciBkaWZmID0gdCA9PT0gMCA/IDAgOiAocmVjZWl2ZUFuZEV4dGVuZCh0KSA8PCBzdWNjZXNzaXZlKTtcbiAgICB6elswXSA9IChjb21wb25lbnQucHJlZCArPSBkaWZmKTtcbiAgfVxuICBmdW5jdGlvbiBkZWNvZGVEQ1N1Y2Nlc3NpdmUoY29tcG9uZW50LCB6eikge1xuICAgIHp6WzBdIHw9IHJlYWRCaXQoKSA8PCBzdWNjZXNzaXZlO1xuICB9XG4gIHZhciBlb2JydW4gPSAwO1xuICBmdW5jdGlvbiBkZWNvZGVBQ0ZpcnN0KGNvbXBvbmVudCwgenopIHtcbiAgICBpZiAoZW9icnVuID4gMCkge1xuICAgICAgZW9icnVuLS07XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBrID0gc3BlY3RyYWxTdGFydCwgZSA9IHNwZWN0cmFsRW5kO1xuICAgIHdoaWxlIChrIDw9IGUpIHtcbiAgICAgIHZhciBycyA9IGRlY29kZUh1ZmZtYW4oY29tcG9uZW50Lmh1ZmZtYW5UYWJsZUFDKTtcbiAgICAgIHZhciBzID0gcnMgJiAxNSwgciA9IHJzID4+IDQ7XG4gICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICBpZiAociA8IDE1KSB7XG4gICAgICAgICAgZW9icnVuID0gcmVjZWl2ZShyKSArICgxIDw8IHIpIC0gMTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBrICs9IDE2O1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGsgKz0gcjtcbiAgICAgIHZhciB6ID0gZGN0WmlnWmFnW2tdO1xuICAgICAgenpbel0gPSByZWNlaXZlQW5kRXh0ZW5kKHMpICogKDEgPDwgc3VjY2Vzc2l2ZSk7XG4gICAgICBrKys7XG4gICAgfVxuICB9XG4gIHZhciBzdWNjZXNzaXZlQUNTdGF0ZSA9IDAsIHN1Y2Nlc3NpdmVBQ05leHRWYWx1ZTtcbiAgZnVuY3Rpb24gZGVjb2RlQUNTdWNjZXNzaXZlKGNvbXBvbmVudCwgenopIHtcbiAgICB2YXIgayA9IHNwZWN0cmFsU3RhcnQsIGUgPSBzcGVjdHJhbEVuZCwgciA9IDA7XG4gICAgd2hpbGUgKGsgPD0gZSkge1xuICAgICAgdmFyIHogPSBkY3RaaWdaYWdba107XG4gICAgICB2YXIgZGlyZWN0aW9uID0genpbel0gPCAwID8gLTEgOiAxO1xuICAgICAgc3dpdGNoIChzdWNjZXNzaXZlQUNTdGF0ZSkge1xuICAgICAgICBjYXNlIDA6IC8vIGluaXRpYWwgc3RhdGVcbiAgICAgICAgICB2YXIgcnMgPSBkZWNvZGVIdWZmbWFuKGNvbXBvbmVudC5odWZmbWFuVGFibGVBQyk7XG4gICAgICAgICAgdmFyIHMgPSBycyAmIDE1LCByID0gcnMgPj4gNDtcbiAgICAgICAgICBpZiAocyA9PT0gMCkge1xuICAgICAgICAgICAgaWYgKHIgPCAxNSkge1xuICAgICAgICAgICAgICBlb2JydW4gPSByZWNlaXZlKHIpICsgKDEgPDwgcik7XG4gICAgICAgICAgICAgIHN1Y2Nlc3NpdmVBQ1N0YXRlID0gNDtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgIHIgPSAxNjtcbiAgICAgICAgICAgICAgc3VjY2Vzc2l2ZUFDU3RhdGUgPSAxO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAocyAhPT0gMSlcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiaW52YWxpZCBBQ24gZW5jb2RpbmdcIik7XG4gICAgICAgICAgICBzdWNjZXNzaXZlQUNOZXh0VmFsdWUgPSByZWNlaXZlQW5kRXh0ZW5kKHMpO1xuICAgICAgICAgICAgc3VjY2Vzc2l2ZUFDU3RhdGUgPSByID8gMiA6IDM7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICBjYXNlIDE6IC8vIHNraXBwaW5nIHIgemVybyBpdGVtc1xuICAgICAgICBjYXNlIDI6XG4gICAgICAgICAgaWYgKHp6W3pdKVxuICAgICAgICAgICAgenpbel0gKz0gKHJlYWRCaXQoKSA8PCBzdWNjZXNzaXZlKSAqIGRpcmVjdGlvbjtcbiAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHItLTtcbiAgICAgICAgICAgIGlmIChyID09PSAwKVxuICAgICAgICAgICAgICBzdWNjZXNzaXZlQUNTdGF0ZSA9IHN1Y2Nlc3NpdmVBQ1N0YXRlID09IDIgPyAzIDogMDtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgMzogLy8gc2V0IHZhbHVlIGZvciBhIHplcm8gaXRlbVxuICAgICAgICAgIGlmICh6elt6XSlcbiAgICAgICAgICAgIHp6W3pdICs9IChyZWFkQml0KCkgPDwgc3VjY2Vzc2l2ZSkgKiBkaXJlY3Rpb247XG4gICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB6elt6XSA9IHN1Y2Nlc3NpdmVBQ05leHRWYWx1ZSA8PCBzdWNjZXNzaXZlO1xuICAgICAgICAgICAgc3VjY2Vzc2l2ZUFDU3RhdGUgPSAwO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSA0OiAvLyBlb2JcbiAgICAgICAgICBpZiAoenpbel0pXG4gICAgICAgICAgICB6elt6XSArPSAocmVhZEJpdCgpIDw8IHN1Y2Nlc3NpdmUpICogZGlyZWN0aW9uO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgICAgaysrO1xuICAgIH1cbiAgICBpZiAoc3VjY2Vzc2l2ZUFDU3RhdGUgPT09IDQpIHtcbiAgICAgIGVvYnJ1bi0tO1xuICAgICAgaWYgKGVvYnJ1biA9PT0gMClcbiAgICAgICAgc3VjY2Vzc2l2ZUFDU3RhdGUgPSAwO1xuICAgIH1cbiAgfVxuICBmdW5jdGlvbiBkZWNvZGVNY3UoY29tcG9uZW50LCBkZWNvZGUsIG1jdSwgcm93LCBjb2wpIHtcbiAgICB2YXIgbWN1Um93ID0gKG1jdSAvIG1jdXNQZXJMaW5lKSB8IDA7XG4gICAgdmFyIG1jdUNvbCA9IG1jdSAlIG1jdXNQZXJMaW5lO1xuICAgIHZhciBibG9ja1JvdyA9IG1jdVJvdyAqIGNvbXBvbmVudC52ICsgcm93O1xuICAgIHZhciBibG9ja0NvbCA9IG1jdUNvbCAqIGNvbXBvbmVudC5oICsgY29sO1xuICAgIC8vIElmIHRoZSBibG9jayBpcyBtaXNzaW5nIGFuZCB3ZSdyZSBpbiB0b2xlcmFudCBtb2RlLCBqdXN0IHNraXAgaXQuXG4gICAgaWYgKGNvbXBvbmVudC5ibG9ja3NbYmxvY2tSb3ddID09PSB1bmRlZmluZWQgJiYgb3B0cy50b2xlcmFudERlY29kaW5nKVxuICAgICAgcmV0dXJuO1xuICAgIGRlY29kZShjb21wb25lbnQsIGNvbXBvbmVudC5ibG9ja3NbYmxvY2tSb3ddW2Jsb2NrQ29sXSk7XG4gIH1cbiAgZnVuY3Rpb24gZGVjb2RlQmxvY2soY29tcG9uZW50LCBkZWNvZGUsIG1jdSkge1xuICAgIHZhciBibG9ja1JvdyA9IChtY3UgLyBjb21wb25lbnQuYmxvY2tzUGVyTGluZSkgfCAwO1xuICAgIHZhciBibG9ja0NvbCA9IG1jdSAlIGNvbXBvbmVudC5ibG9ja3NQZXJMaW5lO1xuICAgIC8vIElmIHRoZSBibG9jayBpcyBtaXNzaW5nIGFuZCB3ZSdyZSBpbiB0b2xlcmFudCBtb2RlLCBqdXN0IHNraXAgaXQuXG4gICAgaWYgKGNvbXBvbmVudC5ibG9ja3NbYmxvY2tSb3ddID09PSB1bmRlZmluZWQgJiYgb3B0cy50b2xlcmFudERlY29kaW5nKVxuICAgICAgcmV0dXJuO1xuICAgIGRlY29kZShjb21wb25lbnQsIGNvbXBvbmVudC5ibG9ja3NbYmxvY2tSb3ddW2Jsb2NrQ29sXSk7XG4gIH1cblxuICB2YXIgY29tcG9uZW50c0xlbmd0aCA9IGNvbXBvbmVudHMubGVuZ3RoO1xuICB2YXIgY29tcG9uZW50LCBpLCBqLCBrLCBuO1xuICB2YXIgZGVjb2RlRm47XG4gIGlmIChwcm9ncmVzc2l2ZSkge1xuICAgIGlmIChzcGVjdHJhbFN0YXJ0ID09PSAwKVxuICAgICAgZGVjb2RlRm4gPSBzdWNjZXNzaXZlUHJldiA9PT0gMCA/IGRlY29kZURDRmlyc3QgOiBkZWNvZGVEQ1N1Y2Nlc3NpdmU7XG4gICAgZWxzZVxuICAgICAgZGVjb2RlRm4gPSBzdWNjZXNzaXZlUHJldiA9PT0gMCA/IGRlY29kZUFDRmlyc3QgOiBkZWNvZGVBQ1N1Y2Nlc3NpdmU7XG4gIH0gZWxzZSB7XG4gICAgZGVjb2RlRm4gPSBkZWNvZGVCYXNlbGluZTtcbiAgfVxuXG4gIHZhciBtY3UgPSAwLCBtYXJrZXI7XG4gIHZhciBtY3VFeHBlY3RlZDtcbiAgaWYgKGNvbXBvbmVudHNMZW5ndGggPT0gMSkge1xuICAgIG1jdUV4cGVjdGVkID0gY29tcG9uZW50c1swXS5ibG9ja3NQZXJMaW5lICogY29tcG9uZW50c1swXS5ibG9ja3NQZXJDb2x1bW47XG4gIH0gZWxzZSB7XG4gICAgbWN1RXhwZWN0ZWQgPSBtY3VzUGVyTGluZSAqIGZyYW1lLm1jdXNQZXJDb2x1bW47XG4gIH1cbiAgaWYgKCFyZXNldEludGVydmFsKSByZXNldEludGVydmFsID0gbWN1RXhwZWN0ZWQ7XG5cbiAgdmFyIGgsIHY7XG4gIHdoaWxlIChtY3UgPCBtY3VFeHBlY3RlZCkge1xuICAgIC8vIHJlc2V0IGludGVydmFsIHN0dWZmXG4gICAgZm9yIChpID0gMDsgaSA8IGNvbXBvbmVudHNMZW5ndGg7IGkrKylcbiAgICAgIGNvbXBvbmVudHNbaV0ucHJlZCA9IDA7XG4gICAgZW9icnVuID0gMDtcblxuICAgIGlmIChjb21wb25lbnRzTGVuZ3RoID09IDEpIHtcbiAgICAgIGNvbXBvbmVudCA9IGNvbXBvbmVudHNbMF07XG4gICAgICBmb3IgKG4gPSAwOyBuIDwgcmVzZXRJbnRlcnZhbDsgbisrKSB7XG4gICAgICAgIGRlY29kZUJsb2NrKGNvbXBvbmVudCwgZGVjb2RlRm4sIG1jdSk7XG4gICAgICAgIG1jdSsrO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBmb3IgKG4gPSAwOyBuIDwgcmVzZXRJbnRlcnZhbDsgbisrKSB7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBjb21wb25lbnRzTGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICBjb21wb25lbnQgPSBjb21wb25lbnRzW2ldO1xuICAgICAgICAgIGggPSBjb21wb25lbnQuaDtcbiAgICAgICAgICB2ID0gY29tcG9uZW50LnY7XG4gICAgICAgICAgZm9yIChqID0gMDsgaiA8IHY7IGorKykge1xuICAgICAgICAgICAgZm9yIChrID0gMDsgayA8IGg7IGsrKykge1xuICAgICAgICAgICAgICBkZWNvZGVNY3UoY29tcG9uZW50LCBkZWNvZGVGbiwgbWN1LCBqLCBrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgbWN1Kys7XG5cbiAgICAgICAgLy8gSWYgd2UndmUgcmVhY2hlZCBvdXIgZXhwZWN0ZWQgTUNVJ3MsIHN0b3AgZGVjb2RpbmdcbiAgICAgICAgaWYgKG1jdSA9PT0gbWN1RXhwZWN0ZWQpIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtY3UgPT09IG1jdUV4cGVjdGVkKSB7XG4gICAgICAvLyBTa2lwIHRyYWlsaW5nIGJ5dGVzIGF0IHRoZSBlbmQgb2YgdGhlIHNjYW4gLSB1bnRpbCB3ZSByZWFjaCB0aGUgbmV4dCBtYXJrZXJcbiAgICAgIGRvIHtcbiAgICAgICAgaWYgKGRhdGFbb2Zmc2V0XSA9PT0gMHhGRikge1xuICAgICAgICAgIGlmIChkYXRhW29mZnNldCArIDFdICE9PSAweDAwKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgb2Zmc2V0ICs9IDE7XG4gICAgICB9IHdoaWxlIChvZmZzZXQgPCBkYXRhLmxlbmd0aCAtIDIpO1xuICAgIH1cblxuICAgIC8vIGZpbmQgbWFya2VyXG4gICAgYml0c0NvdW50ID0gMDtcbiAgICBtYXJrZXIgPSAoZGF0YVtvZmZzZXRdIDw8IDgpIHwgZGF0YVtvZmZzZXQgKyAxXTtcbiAgICBpZiAobWFya2VyIDwgMHhGRjAwKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJtYXJrZXIgd2FzIG5vdCBmb3VuZFwiKTtcbiAgICB9XG5cbiAgICBpZiAobWFya2VyID49IDB4RkZEMCAmJiBtYXJrZXIgPD0gMHhGRkQ3KSB7IC8vIFJTVHhcbiAgICAgIG9mZnNldCArPSAyO1xuICAgIH1cbiAgICBlbHNlXG4gICAgICBicmVhaztcbiAgfVxuXG4gIHJldHVybiBvZmZzZXQgLSBzdGFydE9mZnNldDtcbn1cblxuZnVuY3Rpb24gYnVpbGRDb21wb25lbnREYXRhKGZyYW1lLCBjb21wb25lbnQpIHtcbiAgdmFyIGxpbmVzID0gW107XG4gIHZhciBibG9ja3NQZXJMaW5lID0gY29tcG9uZW50LmJsb2Nrc1BlckxpbmU7XG4gIHZhciBibG9ja3NQZXJDb2x1bW4gPSBjb21wb25lbnQuYmxvY2tzUGVyQ29sdW1uO1xuICB2YXIgc2FtcGxlc1BlckxpbmUgPSBibG9ja3NQZXJMaW5lIDw8IDM7XG4gIC8vIE9ubHkgMSB1c2VkIHBlciBpbnZvY2F0aW9uIG9mIHRoaXMgZnVuY3Rpb24gYW5kIGdhcmJhZ2UgY29sbGVjdGVkIGFmdGVyIGludm9jYXRpb24sIHNvIG5vIG5lZWQgdG8gYWNjb3VudCBmb3IgaXRzIG1lbW9yeSBmb290cHJpbnQuXG4gIHZhciBSID0gbmV3IEludDMyQXJyYXkoNjQpLCByID0gbmV3IFVpbnQ4QXJyYXkoNjQpO1xuXG4gIC8vIEEgcG9ydCBvZiBwb3BwbGVyJ3MgSURDVCBtZXRob2Qgd2hpY2ggaW4gdHVybiBpcyB0YWtlbiBmcm9tOlxuICAvLyAgIENocmlzdG9waCBMb2VmZmxlciwgQWRyaWFhbiBMaWd0ZW5iZXJnLCBHZW9yZ2UgUy4gTW9zY2h5dHosXG4gIC8vICAgXCJQcmFjdGljYWwgRmFzdCAxLUQgRENUIEFsZ29yaXRobXMgd2l0aCAxMSBNdWx0aXBsaWNhdGlvbnNcIixcbiAgLy8gICBJRUVFIEludGwuIENvbmYuIG9uIEFjb3VzdGljcywgU3BlZWNoICYgU2lnbmFsIFByb2Nlc3NpbmcsIDE5ODksXG4gIC8vICAgOTg4LTk5MS5cbiAgZnVuY3Rpb24gcXVhbnRpemVBbmRJbnZlcnNlKHp6LCBkYXRhT3V0LCBkYXRhSW4pIHtcbiAgICB2YXIgcXQgPSBjb21wb25lbnQucXVhbnRpemF0aW9uVGFibGU7XG4gICAgdmFyIHYwLCB2MSwgdjIsIHYzLCB2NCwgdjUsIHY2LCB2NywgdDtcbiAgICB2YXIgcCA9IGRhdGFJbjtcbiAgICB2YXIgaTtcblxuICAgIC8vIGRlcXVhbnRcbiAgICBmb3IgKGkgPSAwOyBpIDwgNjQ7IGkrKylcbiAgICAgIHBbaV0gPSB6eltpXSAqIHF0W2ldO1xuXG4gICAgLy8gaW52ZXJzZSBEQ1Qgb24gcm93c1xuICAgIGZvciAoaSA9IDA7IGkgPCA4OyArK2kpIHtcbiAgICAgIHZhciByb3cgPSA4ICogaTtcblxuICAgICAgLy8gY2hlY2sgZm9yIGFsbC16ZXJvIEFDIGNvZWZmaWNpZW50c1xuICAgICAgaWYgKHBbMSArIHJvd10gPT0gMCAmJiBwWzIgKyByb3ddID09IDAgJiYgcFszICsgcm93XSA9PSAwICYmXG4gICAgICAgIHBbNCArIHJvd10gPT0gMCAmJiBwWzUgKyByb3ddID09IDAgJiYgcFs2ICsgcm93XSA9PSAwICYmXG4gICAgICAgIHBbNyArIHJvd10gPT0gMCkge1xuICAgICAgICB0ID0gKGRjdFNxcnQyICogcFswICsgcm93XSArIDUxMikgPj4gMTA7XG4gICAgICAgIHBbMCArIHJvd10gPSB0O1xuICAgICAgICBwWzEgKyByb3ddID0gdDtcbiAgICAgICAgcFsyICsgcm93XSA9IHQ7XG4gICAgICAgIHBbMyArIHJvd10gPSB0O1xuICAgICAgICBwWzQgKyByb3ddID0gdDtcbiAgICAgICAgcFs1ICsgcm93XSA9IHQ7XG4gICAgICAgIHBbNiArIHJvd10gPSB0O1xuICAgICAgICBwWzcgKyByb3ddID0gdDtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIHN0YWdlIDRcbiAgICAgIHYwID0gKGRjdFNxcnQyICogcFswICsgcm93XSArIDEyOCkgPj4gODtcbiAgICAgIHYxID0gKGRjdFNxcnQyICogcFs0ICsgcm93XSArIDEyOCkgPj4gODtcbiAgICAgIHYyID0gcFsyICsgcm93XTtcbiAgICAgIHYzID0gcFs2ICsgcm93XTtcbiAgICAgIHY0ID0gKGRjdFNxcnQxZDIgKiAocFsxICsgcm93XSAtIHBbNyArIHJvd10pICsgMTI4KSA+PiA4O1xuICAgICAgdjcgPSAoZGN0U3FydDFkMiAqIChwWzEgKyByb3ddICsgcFs3ICsgcm93XSkgKyAxMjgpID4+IDg7XG4gICAgICB2NSA9IHBbMyArIHJvd10gPDwgNDtcbiAgICAgIHY2ID0gcFs1ICsgcm93XSA8PCA0O1xuXG4gICAgICAvLyBzdGFnZSAzXG4gICAgICB0ID0gKHYwIC0gdjEgKyAxKSA+PiAxO1xuICAgICAgdjAgPSAodjAgKyB2MSArIDEpID4+IDE7XG4gICAgICB2MSA9IHQ7XG4gICAgICB0ID0gKHYyICogZGN0U2luNiArIHYzICogZGN0Q29zNiArIDEyOCkgPj4gODtcbiAgICAgIHYyID0gKHYyICogZGN0Q29zNiAtIHYzICogZGN0U2luNiArIDEyOCkgPj4gODtcbiAgICAgIHYzID0gdDtcbiAgICAgIHQgPSAodjQgLSB2NiArIDEpID4+IDE7XG4gICAgICB2NCA9ICh2NCArIHY2ICsgMSkgPj4gMTtcbiAgICAgIHY2ID0gdDtcbiAgICAgIHQgPSAodjcgKyB2NSArIDEpID4+IDE7XG4gICAgICB2NSA9ICh2NyAtIHY1ICsgMSkgPj4gMTtcbiAgICAgIHY3ID0gdDtcblxuICAgICAgLy8gc3RhZ2UgMlxuICAgICAgdCA9ICh2MCAtIHYzICsgMSkgPj4gMTtcbiAgICAgIHYwID0gKHYwICsgdjMgKyAxKSA+PiAxO1xuICAgICAgdjMgPSB0O1xuICAgICAgdCA9ICh2MSAtIHYyICsgMSkgPj4gMTtcbiAgICAgIHYxID0gKHYxICsgdjIgKyAxKSA+PiAxO1xuICAgICAgdjIgPSB0O1xuICAgICAgdCA9ICh2NCAqIGRjdFNpbjMgKyB2NyAqIGRjdENvczMgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY0ID0gKHY0ICogZGN0Q29zMyAtIHY3ICogZGN0U2luMyArIDIwNDgpID4+IDEyO1xuICAgICAgdjcgPSB0O1xuICAgICAgdCA9ICh2NSAqIGRjdFNpbjEgKyB2NiAqIGRjdENvczEgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY1ID0gKHY1ICogZGN0Q29zMSAtIHY2ICogZGN0U2luMSArIDIwNDgpID4+IDEyO1xuICAgICAgdjYgPSB0O1xuXG4gICAgICAvLyBzdGFnZSAxXG4gICAgICBwWzAgKyByb3ddID0gdjAgKyB2NztcbiAgICAgIHBbNyArIHJvd10gPSB2MCAtIHY3O1xuICAgICAgcFsxICsgcm93XSA9IHYxICsgdjY7XG4gICAgICBwWzYgKyByb3ddID0gdjEgLSB2NjtcbiAgICAgIHBbMiArIHJvd10gPSB2MiArIHY1O1xuICAgICAgcFs1ICsgcm93XSA9IHYyIC0gdjU7XG4gICAgICBwWzMgKyByb3ddID0gdjMgKyB2NDtcbiAgICAgIHBbNCArIHJvd10gPSB2MyAtIHY0O1xuICAgIH1cblxuICAgIC8vIGludmVyc2UgRENUIG9uIGNvbHVtbnNcbiAgICBmb3IgKGkgPSAwOyBpIDwgODsgKytpKSB7XG4gICAgICB2YXIgY29sID0gaTtcblxuICAgICAgLy8gY2hlY2sgZm9yIGFsbC16ZXJvIEFDIGNvZWZmaWNpZW50c1xuICAgICAgaWYgKHBbMSAqIDggKyBjb2xdID09IDAgJiYgcFsyICogOCArIGNvbF0gPT0gMCAmJiBwWzMgKiA4ICsgY29sXSA9PSAwICYmXG4gICAgICAgIHBbNCAqIDggKyBjb2xdID09IDAgJiYgcFs1ICogOCArIGNvbF0gPT0gMCAmJiBwWzYgKiA4ICsgY29sXSA9PSAwICYmXG4gICAgICAgIHBbNyAqIDggKyBjb2xdID09IDApIHtcbiAgICAgICAgdCA9IChkY3RTcXJ0MiAqIGRhdGFJbltpICsgMF0gKyA4MTkyKSA+PiAxNDtcbiAgICAgICAgcFswICogOCArIGNvbF0gPSB0O1xuICAgICAgICBwWzEgKiA4ICsgY29sXSA9IHQ7XG4gICAgICAgIHBbMiAqIDggKyBjb2xdID0gdDtcbiAgICAgICAgcFszICogOCArIGNvbF0gPSB0O1xuICAgICAgICBwWzQgKiA4ICsgY29sXSA9IHQ7XG4gICAgICAgIHBbNSAqIDggKyBjb2xdID0gdDtcbiAgICAgICAgcFs2ICogOCArIGNvbF0gPSB0O1xuICAgICAgICBwWzcgKiA4ICsgY29sXSA9IHQ7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBzdGFnZSA0XG4gICAgICB2MCA9IChkY3RTcXJ0MiAqIHBbMCAqIDggKyBjb2xdICsgMjA0OCkgPj4gMTI7XG4gICAgICB2MSA9IChkY3RTcXJ0MiAqIHBbNCAqIDggKyBjb2xdICsgMjA0OCkgPj4gMTI7XG4gICAgICB2MiA9IHBbMiAqIDggKyBjb2xdO1xuICAgICAgdjMgPSBwWzYgKiA4ICsgY29sXTtcbiAgICAgIHY0ID0gKGRjdFNxcnQxZDIgKiAocFsxICogOCArIGNvbF0gLSBwWzcgKiA4ICsgY29sXSkgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY3ID0gKGRjdFNxcnQxZDIgKiAocFsxICogOCArIGNvbF0gKyBwWzcgKiA4ICsgY29sXSkgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY1ID0gcFszICogOCArIGNvbF07XG4gICAgICB2NiA9IHBbNSAqIDggKyBjb2xdO1xuXG4gICAgICAvLyBzdGFnZSAzXG4gICAgICB0ID0gKHYwIC0gdjEgKyAxKSA+PiAxO1xuICAgICAgdjAgPSAodjAgKyB2MSArIDEpID4+IDE7XG4gICAgICB2MSA9IHQ7XG4gICAgICB0ID0gKHYyICogZGN0U2luNiArIHYzICogZGN0Q29zNiArIDIwNDgpID4+IDEyO1xuICAgICAgdjIgPSAodjIgKiBkY3RDb3M2IC0gdjMgKiBkY3RTaW42ICsgMjA0OCkgPj4gMTI7XG4gICAgICB2MyA9IHQ7XG4gICAgICB0ID0gKHY0IC0gdjYgKyAxKSA+PiAxO1xuICAgICAgdjQgPSAodjQgKyB2NiArIDEpID4+IDE7XG4gICAgICB2NiA9IHQ7XG4gICAgICB0ID0gKHY3ICsgdjUgKyAxKSA+PiAxO1xuICAgICAgdjUgPSAodjcgLSB2NSArIDEpID4+IDE7XG4gICAgICB2NyA9IHQ7XG5cbiAgICAgIC8vIHN0YWdlIDJcbiAgICAgIHQgPSAodjAgLSB2MyArIDEpID4+IDE7XG4gICAgICB2MCA9ICh2MCArIHYzICsgMSkgPj4gMTtcbiAgICAgIHYzID0gdDtcbiAgICAgIHQgPSAodjEgLSB2MiArIDEpID4+IDE7XG4gICAgICB2MSA9ICh2MSArIHYyICsgMSkgPj4gMTtcbiAgICAgIHYyID0gdDtcbiAgICAgIHQgPSAodjQgKiBkY3RTaW4zICsgdjcgKiBkY3RDb3MzICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NCA9ICh2NCAqIGRjdENvczMgLSB2NyAqIGRjdFNpbjMgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY3ID0gdDtcbiAgICAgIHQgPSAodjUgKiBkY3RTaW4xICsgdjYgKiBkY3RDb3MxICsgMjA0OCkgPj4gMTI7XG4gICAgICB2NSA9ICh2NSAqIGRjdENvczEgLSB2NiAqIGRjdFNpbjEgKyAyMDQ4KSA+PiAxMjtcbiAgICAgIHY2ID0gdDtcblxuICAgICAgLy8gc3RhZ2UgMVxuICAgICAgcFswICogOCArIGNvbF0gPSB2MCArIHY3O1xuICAgICAgcFs3ICogOCArIGNvbF0gPSB2MCAtIHY3O1xuICAgICAgcFsxICogOCArIGNvbF0gPSB2MSArIHY2O1xuICAgICAgcFs2ICogOCArIGNvbF0gPSB2MSAtIHY2O1xuICAgICAgcFsyICogOCArIGNvbF0gPSB2MiArIHY1O1xuICAgICAgcFs1ICogOCArIGNvbF0gPSB2MiAtIHY1O1xuICAgICAgcFszICogOCArIGNvbF0gPSB2MyArIHY0O1xuICAgICAgcFs0ICogOCArIGNvbF0gPSB2MyAtIHY0O1xuICAgIH1cblxuICAgIC8vIGNvbnZlcnQgdG8gOC1iaXQgaW50ZWdlcnNcbiAgICBmb3IgKGkgPSAwOyBpIDwgNjQ7ICsraSkge1xuICAgICAgdmFyIHNhbXBsZSA9IDEyOCArICgocFtpXSArIDgpID4+IDQpO1xuICAgICAgZGF0YU91dFtpXSA9IHNhbXBsZSA8IDAgPyAwIDogc2FtcGxlID4gMHhGRiA/IDB4RkYgOiBzYW1wbGU7XG4gICAgfVxuICB9XG5cbiAgSnBlZ0ltYWdlLnJlcXVlc3RNZW1vcnlBbGxvY2F0aW9uKHNhbXBsZXNQZXJMaW5lICogYmxvY2tzUGVyQ29sdW1uICogOCk7XG5cbiAgdmFyIGksIGo7XG4gIGZvciAodmFyIGJsb2NrUm93ID0gMDsgYmxvY2tSb3cgPCBibG9ja3NQZXJDb2x1bW47IGJsb2NrUm93KyspIHtcbiAgICB2YXIgc2NhbkxpbmUgPSBibG9ja1JvdyA8PCAzO1xuICAgIGZvciAoaSA9IDA7IGkgPCA4OyBpKyspXG4gICAgICBsaW5lcy5wdXNoKG5ldyBVaW50OEFycmF5KHNhbXBsZXNQZXJMaW5lKSk7XG4gICAgZm9yICh2YXIgYmxvY2tDb2wgPSAwOyBibG9ja0NvbCA8IGJsb2Nrc1BlckxpbmU7IGJsb2NrQ29sKyspIHtcbiAgICAgIHF1YW50aXplQW5kSW52ZXJzZShjb21wb25lbnQuYmxvY2tzW2Jsb2NrUm93XVtibG9ja0NvbF0sIHIsIFIpO1xuXG4gICAgICB2YXIgb2Zmc2V0ID0gMCwgc2FtcGxlID0gYmxvY2tDb2wgPDwgMztcbiAgICAgIGZvciAoaiA9IDA7IGogPCA4OyBqKyspIHtcbiAgICAgICAgdmFyIGxpbmUgPSBsaW5lc1tzY2FuTGluZSArIGpdO1xuICAgICAgICBmb3IgKGkgPSAwOyBpIDwgODsgaSsrKVxuICAgICAgICAgIGxpbmVbc2FtcGxlICsgaV0gPSByW29mZnNldCsrXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgcmV0dXJuIGxpbmVzO1xufVxuXG5mdW5jdGlvbiBjbGFtcFRvOGJpdChhKSB7XG4gIHJldHVybiBhIDwgMCA/IDAgOiBhID4gMjU1ID8gMjU1IDogYTtcbn1cblxuY2xhc3MgSnBlZ0ltYWdlIHtcbiAgc3RhdGljIHRvdGFsQnl0ZXNBbGxvY2F0ZWQgPSAwO1xuICBzdGF0aWMgbWF4TWVtb3J5VXNhZ2VCeXRlcyA9IDA7XG5cbiAgc3RhdGljIHJlcXVlc3RNZW1vcnlBbGxvY2F0aW9uKGluY3JlYXNlQW1vdW50ID0gMCkge1xuICAgIHZhciB0b3RhbE1lbW9yeUltcGFjdEJ5dGVzID0gSnBlZ0ltYWdlLnRvdGFsQnl0ZXNBbGxvY2F0ZWQgKyBpbmNyZWFzZUFtb3VudDtcbiAgICBpZiAodG90YWxNZW1vcnlJbXBhY3RCeXRlcyA+IEpwZWdJbWFnZS5tYXhNZW1vcnlVc2FnZUJ5dGVzKSB7XG4gICAgICB2YXIgZXhjZWVkZWRBbW91bnQgPSBNYXRoLmNlaWwoKHRvdGFsTWVtb3J5SW1wYWN0Qnl0ZXMgLSBKcGVnSW1hZ2UubWF4TWVtb3J5VXNhZ2VCeXRlcykgLyAxMDI0IC8gMTAyNCk7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYG1heE1lbW9yeVVzYWdlSW5NQiBsaW1pdCBleGNlZWRlZCBieSBhdCBsZWFzdCAke2V4Y2VlZGVkQW1vdW50fU1CYCk7XG4gICAgfVxuXG4gICAgSnBlZ0ltYWdlLnRvdGFsQnl0ZXNBbGxvY2F0ZWQgPSB0b3RhbE1lbW9yeUltcGFjdEJ5dGVzO1xuICB9XG5cbiAgc3RhdGljIHJlc2V0TWF4TWVtb3J5VXNhZ2UobWF4TWVtb3J5VXNhZ2VCeXRlc18pIHtcbiAgICBKcGVnSW1hZ2UudG90YWxCeXRlc0FsbG9jYXRlZCA9IDA7XG4gICAgSnBlZ0ltYWdlLm1heE1lbW9yeVVzYWdlQnl0ZXMgPSBtYXhNZW1vcnlVc2FnZUJ5dGVzXztcbiAgfTtcblxuICBzdGF0aWMgZ2V0Qnl0ZXNBbGxvY2F0ZWQoKSB7XG4gICAgcmV0dXJuIEpwZWdJbWFnZS50b3RhbEJ5dGVzQWxsb2NhdGVkO1xuICB9O1xuXG4gIGNvbnN0cnVjdG9yKCkge1xuICAgIHRoaXMub3B0cyA9IHt9O1xuICAgIHRoaXMucXVhbGl0eSA9IDA7XG4gIH1cblxuICBwYXJzZShkYXRhKSB7XG4gICAgdmFyIG1heFJlc29sdXRpb25JblBpeGVscyA9IHRoaXMub3B0cy5tYXhSZXNvbHV0aW9uSW5NUCAqIDEwMDAgKiAxMDAwO1xuICAgIHZhciBvZmZzZXQgPSAwLCBsZW5ndGggPSBkYXRhLmxlbmd0aDtcbiAgICBmdW5jdGlvbiByZWFkVWludDE2KCkge1xuICAgICAgdmFyIHZhbHVlID0gKGRhdGFbb2Zmc2V0XSA8PCA4KSB8IGRhdGFbb2Zmc2V0ICsgMV07XG4gICAgICBvZmZzZXQgKz0gMjtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG4gICAgZnVuY3Rpb24gcmVhZERhdGFCbG9jaygpIHtcbiAgICAgIHZhciBsZW5ndGggPSByZWFkVWludDE2KCk7XG4gICAgICB2YXIgYXJyYXkgPSBkYXRhLnN1YmFycmF5KG9mZnNldCwgb2Zmc2V0ICsgbGVuZ3RoIC0gMik7XG4gICAgICBvZmZzZXQgKz0gYXJyYXkubGVuZ3RoO1xuICAgICAgcmV0dXJuIGFycmF5O1xuICAgIH1cbiAgICBmdW5jdGlvbiBwcmVwYXJlQ29tcG9uZW50cyhmcmFtZSkge1xuICAgICAgdmFyIG1heEggPSAwLCBtYXhWID0gMDtcbiAgICAgIHZhciBjb21wb25lbnQsIGNvbXBvbmVudElkO1xuICAgICAgZm9yIChjb21wb25lbnRJZCBpbiBmcmFtZS5jb21wb25lbnRzKSB7XG4gICAgICAgIGlmIChmcmFtZS5jb21wb25lbnRzLmhhc093blByb3BlcnR5KGNvbXBvbmVudElkKSkge1xuICAgICAgICAgIGNvbXBvbmVudCA9IGZyYW1lLmNvbXBvbmVudHNbY29tcG9uZW50SWRdO1xuICAgICAgICAgIGlmIChtYXhIIDwgY29tcG9uZW50LmgpIG1heEggPSBjb21wb25lbnQuaDtcbiAgICAgICAgICBpZiAobWF4ViA8IGNvbXBvbmVudC52KSBtYXhWID0gY29tcG9uZW50LnY7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIHZhciBtY3VzUGVyTGluZSA9IE1hdGguY2VpbChmcmFtZS5zYW1wbGVzUGVyTGluZSAvIDggLyBtYXhIKTtcbiAgICAgIHZhciBtY3VzUGVyQ29sdW1uID0gTWF0aC5jZWlsKGZyYW1lLnNjYW5MaW5lcyAvIDggLyBtYXhWKTtcbiAgICAgIGZvciAoY29tcG9uZW50SWQgaW4gZnJhbWUuY29tcG9uZW50cykge1xuICAgICAgICBpZiAoZnJhbWUuY29tcG9uZW50cy5oYXNPd25Qcm9wZXJ0eShjb21wb25lbnRJZCkpIHtcbiAgICAgICAgICBjb21wb25lbnQgPSBmcmFtZS5jb21wb25lbnRzW2NvbXBvbmVudElkXTtcbiAgICAgICAgICB2YXIgYmxvY2tzUGVyTGluZSA9IE1hdGguY2VpbChNYXRoLmNlaWwoZnJhbWUuc2FtcGxlc1BlckxpbmUgLyA4KSAqIGNvbXBvbmVudC5oIC8gbWF4SCk7XG4gICAgICAgICAgdmFyIGJsb2Nrc1BlckNvbHVtbiA9IE1hdGguY2VpbChNYXRoLmNlaWwoZnJhbWUuc2NhbkxpbmVzIC8gOCkgKiBjb21wb25lbnQudiAvIG1heFYpO1xuICAgICAgICAgIHZhciBibG9ja3NQZXJMaW5lRm9yTWN1ID0gbWN1c1BlckxpbmUgKiBjb21wb25lbnQuaDtcbiAgICAgICAgICB2YXIgYmxvY2tzUGVyQ29sdW1uRm9yTWN1ID0gbWN1c1BlckNvbHVtbiAqIGNvbXBvbmVudC52O1xuICAgICAgICAgIHZhciBibG9ja3NUb0FsbG9jYXRlID0gYmxvY2tzUGVyQ29sdW1uRm9yTWN1ICogYmxvY2tzUGVyTGluZUZvck1jdTtcbiAgICAgICAgICB2YXIgYmxvY2tzID0gW107XG5cbiAgICAgICAgICAvLyBFYWNoIGJsb2NrIGlzIGEgSW50MzJBcnJheSBvZiBsZW5ndGggNjQgKDQgeCA2NCA9IDI1NiBieXRlcylcbiAgICAgICAgICBKcGVnSW1hZ2UucmVxdWVzdE1lbW9yeUFsbG9jYXRpb24oYmxvY2tzVG9BbGxvY2F0ZSAqIDI1Nik7XG5cbiAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGJsb2Nrc1BlckNvbHVtbkZvck1jdTsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgcm93ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IGJsb2Nrc1BlckxpbmVGb3JNY3U7IGorKylcbiAgICAgICAgICAgICAgcm93LnB1c2gobmV3IEludDMyQXJyYXkoNjQpKTtcbiAgICAgICAgICAgIGJsb2Nrcy5wdXNoKHJvdyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGNvbXBvbmVudC5ibG9ja3NQZXJMaW5lID0gYmxvY2tzUGVyTGluZTtcbiAgICAgICAgICBjb21wb25lbnQuYmxvY2tzUGVyQ29sdW1uID0gYmxvY2tzUGVyQ29sdW1uO1xuICAgICAgICAgIGNvbXBvbmVudC5ibG9ja3MgPSBibG9ja3M7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIGZyYW1lLm1heEggPSBtYXhIO1xuICAgICAgZnJhbWUubWF4ViA9IG1heFY7XG4gICAgICBmcmFtZS5tY3VzUGVyTGluZSA9IG1jdXNQZXJMaW5lO1xuICAgICAgZnJhbWUubWN1c1BlckNvbHVtbiA9IG1jdXNQZXJDb2x1bW47XG4gICAgfVxuICAgIHZhciBqZmlmID0gbnVsbDtcbiAgICB2YXIgYWRvYmUgPSBudWxsO1xuICAgIHZhciBwaXhlbHMgPSBudWxsO1xuICAgIHZhciBmcmFtZSwgcmVzZXRJbnRlcnZhbDtcbiAgICB2YXIgcXVhbnRpemF0aW9uVGFibGVzID0gW10sIGZyYW1lcyA9IFtdO1xuICAgIHZhciBodWZmbWFuVGFibGVzQUMgPSBbXSwgaHVmZm1hblRhYmxlc0RDID0gW107XG4gICAgdmFyIGZpbGVNYXJrZXIgPSByZWFkVWludDE2KCk7XG4gICAgdmFyIG1hbGZvcm1lZERhdGFPZmZzZXQgPSAtMTtcbiAgICB0aGlzLmNvbW1lbnRzID0gW107XG4gICAgaWYgKGZpbGVNYXJrZXIgIT0gMHhGRkQ4KSB7IC8vIFNPSSAoU3RhcnQgb2YgSW1hZ2UpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJTT0kgbm90IGZvdW5kXCIpO1xuICAgIH1cblxuICAgIGZpbGVNYXJrZXIgPSByZWFkVWludDE2KCk7XG4gICAgd2hpbGUgKGZpbGVNYXJrZXIgIT0gMHhGRkQ5KSB7IC8vIEVPSSAoRW5kIG9mIGltYWdlKVxuICAgICAgdmFyIGksIGosIGw7XG4gICAgICBzd2l0Y2ggKGZpbGVNYXJrZXIpIHtcbiAgICAgICAgY2FzZSAweEZGMDA6IGJyZWFrO1xuICAgICAgICBjYXNlIDB4RkZFMDogLy8gQVBQMCAoQXBwbGljYXRpb24gU3BlY2lmaWMpXG4gICAgICAgIGNhc2UgMHhGRkUxOiAvLyBBUFAxXG4gICAgICAgIGNhc2UgMHhGRkUyOiAvLyBBUFAyXG4gICAgICAgIGNhc2UgMHhGRkUzOiAvLyBBUFAzXG4gICAgICAgIGNhc2UgMHhGRkU0OiAvLyBBUFA0XG4gICAgICAgIGNhc2UgMHhGRkU1OiAvLyBBUFA1XG4gICAgICAgIGNhc2UgMHhGRkU2OiAvLyBBUFA2XG4gICAgICAgIGNhc2UgMHhGRkU3OiAvLyBBUFA3XG4gICAgICAgIGNhc2UgMHhGRkU4OiAvLyBBUFA4XG4gICAgICAgIGNhc2UgMHhGRkU5OiAvLyBBUFA5XG4gICAgICAgIGNhc2UgMHhGRkVBOiAvLyBBUFAxMFxuICAgICAgICBjYXNlIDB4RkZFQjogLy8gQVBQMTFcbiAgICAgICAgY2FzZSAweEZGRUM6IC8vIEFQUDEyXG4gICAgICAgIGNhc2UgMHhGRkVEOiAvLyBBUFAxM1xuICAgICAgICBjYXNlIDB4RkZFRTogLy8gQVBQMTRcbiAgICAgICAgY2FzZSAweEZGRUY6IC8vIEFQUDE1XG4gICAgICAgIGNhc2UgMHhGRkZFOiAvLyBDT00gKENvbW1lbnQpXG4gICAgICAgICAgdmFyIGFwcERhdGEgPSByZWFkRGF0YUJsb2NrKCk7XG5cbiAgICAgICAgICBpZiAoZmlsZU1hcmtlciA9PT0gMHhGRkZFKSB7XG4gICAgICAgICAgICB2YXIgY29tbWVudCA9IFN0cmluZy5mcm9tQ2hhckNvZGUuYXBwbHkobnVsbCwgYXBwRGF0YSk7XG4gICAgICAgICAgICB0aGlzLmNvbW1lbnRzLnB1c2goY29tbWVudCk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKGZpbGVNYXJrZXIgPT09IDB4RkZFMCkge1xuICAgICAgICAgICAgaWYgKGFwcERhdGFbMF0gPT09IDB4NEEgJiYgYXBwRGF0YVsxXSA9PT0gMHg0NiAmJiBhcHBEYXRhWzJdID09PSAweDQ5ICYmXG4gICAgICAgICAgICAgIGFwcERhdGFbM10gPT09IDB4NDYgJiYgYXBwRGF0YVs0XSA9PT0gMCkgeyAvLyAnSkZJRlxceDAwJ1xuICAgICAgICAgICAgICBqZmlmID0ge1xuICAgICAgICAgICAgICAgIHZlcnNpb246IHsgbWFqb3I6IGFwcERhdGFbNV0sIG1pbm9yOiBhcHBEYXRhWzZdIH0sXG4gICAgICAgICAgICAgICAgZGVuc2l0eVVuaXRzOiBhcHBEYXRhWzddLFxuICAgICAgICAgICAgICAgIHhEZW5zaXR5OiAoYXBwRGF0YVs4XSA8PCA4KSB8IGFwcERhdGFbOV0sXG4gICAgICAgICAgICAgICAgeURlbnNpdHk6IChhcHBEYXRhWzEwXSA8PCA4KSB8IGFwcERhdGFbMTFdLFxuICAgICAgICAgICAgICAgIHRodW1iV2lkdGg6IGFwcERhdGFbMTJdLFxuICAgICAgICAgICAgICAgIHRodW1iSGVpZ2h0OiBhcHBEYXRhWzEzXSxcbiAgICAgICAgICAgICAgICB0aHVtYkRhdGE6IGFwcERhdGEuc3ViYXJyYXkoMTQsIDE0ICsgMyAqIGFwcERhdGFbMTJdICogYXBwRGF0YVsxM10pXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIFRPRE8gQVBQMSAtIEV4aWZcbiAgICAgICAgICBpZiAoZmlsZU1hcmtlciA9PT0gMHhGRkUxKSB7XG4gICAgICAgICAgICBpZiAoYXBwRGF0YVswXSA9PT0gMHg0NSAmJlxuICAgICAgICAgICAgICBhcHBEYXRhWzFdID09PSAweDc4ICYmXG4gICAgICAgICAgICAgIGFwcERhdGFbMl0gPT09IDB4NjkgJiZcbiAgICAgICAgICAgICAgYXBwRGF0YVszXSA9PT0gMHg2NiAmJlxuICAgICAgICAgICAgICBhcHBEYXRhWzRdID09PSAwKSB7IC8vICdFWElGXFx4MDAnXG4gICAgICAgICAgICAgIHRoaXMuZXhpZkJ1ZmZlciA9IGFwcERhdGEuc3ViYXJyYXkoNSwgYXBwRGF0YS5sZW5ndGgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmIChmaWxlTWFya2VyID09PSAweEZGRUUpIHtcbiAgICAgICAgICAgIGlmIChhcHBEYXRhWzBdID09PSAweDQxICYmIGFwcERhdGFbMV0gPT09IDB4NjQgJiYgYXBwRGF0YVsyXSA9PT0gMHg2RiAmJlxuICAgICAgICAgICAgICBhcHBEYXRhWzNdID09PSAweDYyICYmIGFwcERhdGFbNF0gPT09IDB4NjUgJiYgYXBwRGF0YVs1XSA9PT0gMCkgeyAvLyAnQWRvYmVcXHgwMCdcbiAgICAgICAgICAgICAgYWRvYmUgPSB7XG4gICAgICAgICAgICAgICAgdmVyc2lvbjogYXBwRGF0YVs2XSxcbiAgICAgICAgICAgICAgICBmbGFnczA6IChhcHBEYXRhWzddIDw8IDgpIHwgYXBwRGF0YVs4XSxcbiAgICAgICAgICAgICAgICBmbGFnczE6IChhcHBEYXRhWzldIDw8IDgpIHwgYXBwRGF0YVsxMF0sXG4gICAgICAgICAgICAgICAgdHJhbnNmb3JtQ29kZTogYXBwRGF0YVsxMV1cbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAweEZGREI6IC8vIERRVCAoRGVmaW5lIFF1YW50aXphdGlvbiBUYWJsZXMpXG4gICAgICAgICAgdmFyIHF1YW50aXphdGlvblRhYmxlc0xlbmd0aCA9IHJlYWRVaW50MTYoKTtcbiAgICAgICAgICB2YXIgcXVhbnRpemF0aW9uVGFibGVzRW5kID0gcXVhbnRpemF0aW9uVGFibGVzTGVuZ3RoICsgb2Zmc2V0IC0gMjtcbiAgICAgICAgICB3aGlsZSAob2Zmc2V0IDwgcXVhbnRpemF0aW9uVGFibGVzRW5kKSB7XG4gICAgICAgICAgICB2YXIgcXVhbnRpemF0aW9uVGFibGVTcGVjID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgICBKcGVnSW1hZ2UucmVxdWVzdE1lbW9yeUFsbG9jYXRpb24oNjQgKiA0KTtcbiAgICAgICAgICAgIHZhciB0YWJsZURhdGEgPSBuZXcgSW50MzJBcnJheSg2NCk7XG4gICAgICAgICAgICBpZiAoKHF1YW50aXphdGlvblRhYmxlU3BlYyA+PiA0KSA9PT0gMCkgeyAvLyA4IGJpdCB2YWx1ZXNcbiAgICAgICAgICAgICAgZm9yIChqID0gMDsgaiA8IDY0OyBqKyspIHtcbiAgICAgICAgICAgICAgICB2YXIgeiA9IGRjdFppZ1phZ1tqXTtcbiAgICAgICAgICAgICAgICB0YWJsZURhdGFbel0gPSBkYXRhW29mZnNldCsrXTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIGlmICgocXVhbnRpemF0aW9uVGFibGVTcGVjID4+IDQpID09PSAxKSB7IC8vMTYgYml0XG4gICAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCA2NDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdmFyIHogPSBkY3RaaWdaYWdbal07XG4gICAgICAgICAgICAgICAgdGFibGVEYXRhW3pdID0gcmVhZFVpbnQxNigpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiRFFUOiBpbnZhbGlkIHRhYmxlIHNwZWNcIik7XG4gICAgICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbcXVhbnRpemF0aW9uVGFibGVTcGVjICYgMTVdID0gdGFibGVEYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIDB4RkZDMDogLy8gU09GMCAoU3RhcnQgb2YgRnJhbWUsIEJhc2VsaW5lIERDVClcbiAgICAgICAgY2FzZSAweEZGQzE6IC8vIFNPRjEgKFN0YXJ0IG9mIEZyYW1lLCBFeHRlbmRlZCBEQ1QpXG4gICAgICAgIGNhc2UgMHhGRkMyOiAvLyBTT0YyIChTdGFydCBvZiBGcmFtZSwgUHJvZ3Jlc3NpdmUgRENUKVxuICAgICAgICAgIHJlYWRVaW50MTYoKTsgLy8gc2tpcCBkYXRhIGxlbmd0aFxuICAgICAgICAgIGZyYW1lID0ge307XG4gICAgICAgICAgZnJhbWUuZXh0ZW5kZWQgPSAoZmlsZU1hcmtlciA9PT0gMHhGRkMxKTtcbiAgICAgICAgICBmcmFtZS5wcm9ncmVzc2l2ZSA9IChmaWxlTWFya2VyID09PSAweEZGQzIpO1xuICAgICAgICAgIGZyYW1lLnByZWNpc2lvbiA9IGRhdGFbb2Zmc2V0KytdO1xuICAgICAgICAgIGZyYW1lLnNjYW5MaW5lcyA9IHJlYWRVaW50MTYoKTtcbiAgICAgICAgICBmcmFtZS5zYW1wbGVzUGVyTGluZSA9IHJlYWRVaW50MTYoKTtcbiAgICAgICAgICBmcmFtZS5jb21wb25lbnRzID0ge307XG4gICAgICAgICAgZnJhbWUuY29tcG9uZW50c09yZGVyID0gW107XG5cbiAgICAgICAgICB2YXIgcGl4ZWxzSW5GcmFtZSA9IGZyYW1lLnNjYW5MaW5lcyAqIGZyYW1lLnNhbXBsZXNQZXJMaW5lO1xuICAgICAgICAgIGlmIChwaXhlbHNJbkZyYW1lID4gbWF4UmVzb2x1dGlvbkluUGl4ZWxzKSB7XG4gICAgICAgICAgICB2YXIgZXhjZWVkZWRBbW91bnQgPSBNYXRoLmNlaWwoKHBpeGVsc0luRnJhbWUgLSBtYXhSZXNvbHV0aW9uSW5QaXhlbHMpIC8gMWU2KTtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgbWF4UmVzb2x1dGlvbkluTVAgbGltaXQgZXhjZWVkZWQgYnkgJHtleGNlZWRlZEFtb3VudH1NUGApO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIHZhciBjb21wb25lbnRzQ291bnQgPSBkYXRhW29mZnNldCsrXSwgY29tcG9uZW50SWQ7XG4gICAgICAgICAgdmFyIG1heEggPSAwLCBtYXhWID0gMDtcbiAgICAgICAgICBmb3IgKGkgPSAwOyBpIDwgY29tcG9uZW50c0NvdW50OyBpKyspIHtcbiAgICAgICAgICAgIGNvbXBvbmVudElkID0gZGF0YVtvZmZzZXRdO1xuICAgICAgICAgICAgdmFyIGggPSBkYXRhW29mZnNldCArIDFdID4+IDQ7XG4gICAgICAgICAgICB2YXIgdiA9IGRhdGFbb2Zmc2V0ICsgMV0gJiAxNTtcbiAgICAgICAgICAgIHZhciBxSWQgPSBkYXRhW29mZnNldCArIDJdO1xuICAgICAgICAgICAgZnJhbWUuY29tcG9uZW50c09yZGVyLnB1c2goY29tcG9uZW50SWQpO1xuICAgICAgICAgICAgZnJhbWUuY29tcG9uZW50c1tjb21wb25lbnRJZF0gPSB7XG4gICAgICAgICAgICAgIGg6IGgsXG4gICAgICAgICAgICAgIHY6IHYsXG4gICAgICAgICAgICAgIHF1YW50aXphdGlvbklkeDogcUlkXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgb2Zmc2V0ICs9IDM7XG4gICAgICAgICAgfVxuICAgICAgICAgIHByZXBhcmVDb21wb25lbnRzKGZyYW1lKTtcbiAgICAgICAgICBmcmFtZXMucHVzaChmcmFtZSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAweEZGQzQ6IC8vIERIVCAoRGVmaW5lIEh1ZmZtYW4gVGFibGVzKVxuICAgICAgICAgIHZhciBodWZmbWFuTGVuZ3RoID0gcmVhZFVpbnQxNigpO1xuICAgICAgICAgIGZvciAoaSA9IDI7IGkgPCBodWZmbWFuTGVuZ3RoOykge1xuICAgICAgICAgICAgdmFyIGh1ZmZtYW5UYWJsZVNwZWMgPSBkYXRhW29mZnNldCsrXTtcbiAgICAgICAgICAgIHZhciBjb2RlTGVuZ3RocyA9IG5ldyBVaW50OEFycmF5KDE2KTtcbiAgICAgICAgICAgIHZhciBjb2RlTGVuZ3RoU3VtID0gMDtcbiAgICAgICAgICAgIGZvciAoaiA9IDA7IGogPCAxNjsgaisrLCBvZmZzZXQrKykge1xuICAgICAgICAgICAgICBjb2RlTGVuZ3RoU3VtICs9IChjb2RlTGVuZ3Roc1tqXSA9IGRhdGFbb2Zmc2V0XSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBKcGVnSW1hZ2UucmVxdWVzdE1lbW9yeUFsbG9jYXRpb24oMTYgKyBjb2RlTGVuZ3RoU3VtKTtcbiAgICAgICAgICAgIHZhciBodWZmbWFuVmFsdWVzID0gbmV3IFVpbnQ4QXJyYXkoY29kZUxlbmd0aFN1bSk7XG4gICAgICAgICAgICBmb3IgKGogPSAwOyBqIDwgY29kZUxlbmd0aFN1bTsgaisrLCBvZmZzZXQrKylcbiAgICAgICAgICAgICAgaHVmZm1hblZhbHVlc1tqXSA9IGRhdGFbb2Zmc2V0XTtcbiAgICAgICAgICAgIGkgKz0gMTcgKyBjb2RlTGVuZ3RoU3VtO1xuXG4gICAgICAgICAgICAoKGh1ZmZtYW5UYWJsZVNwZWMgPj4gNCkgPT09IDAgP1xuICAgICAgICAgICAgICBodWZmbWFuVGFibGVzREMgOiBodWZmbWFuVGFibGVzQUMpW2h1ZmZtYW5UYWJsZVNwZWMgJiAxNV0gPVxuICAgICAgICAgICAgICBidWlsZEh1ZmZtYW5UYWJsZShjb2RlTGVuZ3RocywgaHVmZm1hblZhbHVlcyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgMHhGRkREOiAvLyBEUkkgKERlZmluZSBSZXN0YXJ0IEludGVydmFsKVxuICAgICAgICAgIHJlYWRVaW50MTYoKTsgLy8gc2tpcCBkYXRhIGxlbmd0aFxuICAgICAgICAgIHJlc2V0SW50ZXJ2YWwgPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAweEZGREM6IC8vIE51bWJlciBvZiBMaW5lcyBtYXJrZXJcbiAgICAgICAgICByZWFkVWludDE2KCkgLy8gc2tpcCBkYXRhIGxlbmd0aFxuICAgICAgICAgIHJlYWRVaW50MTYoKSAvLyBJZ25vcmUgdGhpcyBkYXRhIHNpbmNlIGl0IHJlcHJlc2VudHMgdGhlIGltYWdlIGhlaWdodFxuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgMHhGRkRBOiAvLyBTT1MgKFN0YXJ0IG9mIFNjYW4pXG4gICAgICAgICAgdmFyIHNjYW5MZW5ndGggPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgdmFyIHNlbGVjdG9yc0NvdW50ID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgdmFyIGNvbXBvbmVudHMgPSBbXSwgY29tcG9uZW50O1xuICAgICAgICAgIGZvciAoaSA9IDA7IGkgPCBzZWxlY3RvcnNDb3VudDsgaSsrKSB7XG4gICAgICAgICAgICBjb21wb25lbnQgPSBmcmFtZS5jb21wb25lbnRzW2RhdGFbb2Zmc2V0KytdXTtcbiAgICAgICAgICAgIHZhciB0YWJsZVNwZWMgPSBkYXRhW29mZnNldCsrXTtcbiAgICAgICAgICAgIGNvbXBvbmVudC5odWZmbWFuVGFibGVEQyA9IGh1ZmZtYW5UYWJsZXNEQ1t0YWJsZVNwZWMgPj4gNF07XG4gICAgICAgICAgICBjb21wb25lbnQuaHVmZm1hblRhYmxlQUMgPSBodWZmbWFuVGFibGVzQUNbdGFibGVTcGVjICYgMTVdO1xuICAgICAgICAgICAgY29tcG9uZW50cy5wdXNoKGNvbXBvbmVudCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHZhciBzcGVjdHJhbFN0YXJ0ID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgdmFyIHNwZWN0cmFsRW5kID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgdmFyIHN1Y2Nlc3NpdmVBcHByb3hpbWF0aW9uID0gZGF0YVtvZmZzZXQrK107XG4gICAgICAgICAgdmFyIHByb2Nlc3NlZCA9IGRlY29kZVNjYW4oZGF0YSwgb2Zmc2V0LFxuICAgICAgICAgICAgZnJhbWUsIGNvbXBvbmVudHMsIHJlc2V0SW50ZXJ2YWwsXG4gICAgICAgICAgICBzcGVjdHJhbFN0YXJ0LCBzcGVjdHJhbEVuZCxcbiAgICAgICAgICAgIHN1Y2Nlc3NpdmVBcHByb3hpbWF0aW9uID4+IDQsIHN1Y2Nlc3NpdmVBcHByb3hpbWF0aW9uICYgMTUsIHRoaXMub3B0cyk7XG4gICAgICAgICAgb2Zmc2V0ICs9IHByb2Nlc3NlZDtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIDB4RkZGRjogLy8gRmlsbCBieXRlc1xuICAgICAgICAgIGlmIChkYXRhW29mZnNldF0gIT09IDB4RkYpIHsgLy8gQXZvaWQgc2tpcHBpbmcgYSB2YWxpZCBtYXJrZXIuXG4gICAgICAgICAgICBvZmZzZXQtLTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgaWYgKGRhdGFbb2Zmc2V0IC0gM10gPT0gMHhGRiAmJlxuICAgICAgICAgICAgZGF0YVtvZmZzZXQgLSAyXSA+PSAweEMwICYmIGRhdGFbb2Zmc2V0IC0gMl0gPD0gMHhGRSkge1xuICAgICAgICAgICAgLy8gY291bGQgYmUgaW5jb3JyZWN0IGVuY29kaW5nIC0tIGxhc3QgMHhGRiBieXRlIG9mIHRoZSBwcmV2aW91c1xuICAgICAgICAgICAgLy8gYmxvY2sgd2FzIGVhdGVuIGJ5IHRoZSBlbmNvZGVyXG4gICAgICAgICAgICBvZmZzZXQgLT0gMztcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgICBlbHNlIGlmIChmaWxlTWFya2VyID09PSAweEUwIHx8IGZpbGVNYXJrZXIgPT0gMHhFMSkge1xuICAgICAgICAgICAgLy8gUmVjb3ZlciBmcm9tIG1hbGZvcm1lZCBBUFAxIG1hcmtlcnMgcG9wdWxhciBpbiBzb21lIHBob25lIG1vZGVscy5cbiAgICAgICAgICAgIC8vIFNlZSBodHRwczovL2dpdGh1Yi5jb20vZXVnZW5ld2FyZS9qcGVnLWpzL2lzc3Vlcy84MlxuICAgICAgICAgICAgaWYgKG1hbGZvcm1lZERhdGFPZmZzZXQgIT09IC0xKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgZmlyc3QgdW5rbm93biBKUEVHIG1hcmtlciBhdCBvZmZzZXQgJHttYWxmb3JtZWREYXRhT2Zmc2V0LnRvU3RyaW5nKDE2KX0sIHNlY29uZCB1bmtub3duIEpQRUcgbWFya2VyICR7ZmlsZU1hcmtlci50b1N0cmluZygxNil9IGF0IG9mZnNldCAkeyhvZmZzZXQgLSAxKS50b1N0cmluZygxNil9YCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBtYWxmb3JtZWREYXRhT2Zmc2V0ID0gb2Zmc2V0IC0gMTtcbiAgICAgICAgICAgIGNvbnN0IG5leHRPZmZzZXQgPSByZWFkVWludDE2KCk7XG4gICAgICAgICAgICBpZiAoZGF0YVtvZmZzZXQgKyBuZXh0T2Zmc2V0IC0gMl0gPT09IDB4RkYpIHtcbiAgICAgICAgICAgICAgb2Zmc2V0ICs9IG5leHRPZmZzZXQgLSAyO1xuICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwidW5rbm93biBKUEVHIG1hcmtlciBcIiArIGZpbGVNYXJrZXIudG9TdHJpbmcoMTYpKTtcbiAgICAgIH1cbiAgICAgIGZpbGVNYXJrZXIgPSByZWFkVWludDE2KCk7XG4gICAgfVxuICAgIGlmIChmcmFtZXMubGVuZ3RoICE9IDEpXG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXCJvbmx5IHNpbmdsZSBmcmFtZSBKUEVHcyBzdXBwb3J0ZWRcIik7XG5cbiAgICAvLyBzZXQgZWFjaCBmcmFtZSdzIGNvbXBvbmVudHMgcXVhbnRpemF0aW9uIHRhYmxlXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBmcmFtZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIHZhciBjcCA9IGZyYW1lc1tpXS5jb21wb25lbnRzO1xuICAgICAgZm9yICh2YXIgaiBpbiBjcCkge1xuICAgICAgICBjcFtqXS5xdWFudGl6YXRpb25UYWJsZSA9IHF1YW50aXphdGlvblRhYmxlc1tjcFtqXS5xdWFudGl6YXRpb25JZHhdO1xuICAgICAgICBkZWxldGUgY3Bbal0ucXVhbnRpemF0aW9uSWR4O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRoaXMud2lkdGggPSBmcmFtZS5zYW1wbGVzUGVyTGluZTtcbiAgICB0aGlzLmhlaWdodCA9IGZyYW1lLnNjYW5MaW5lcztcbiAgICB0aGlzLmpmaWYgPSBqZmlmO1xuICAgIHRoaXMuYWRvYmUgPSBhZG9iZTtcbiAgICB0aGlzLmNvbXBvbmVudHMgPSBbXTtcbiAgICAvLyBmb3IgKHZhciBpID0gMDsgaSA8IGZyYW1lLmNvbXBvbmVudHNPcmRlci5sZW5ndGg7IGkrKykge1xuICAgIC8vICAgdmFyIGNvbXBvbmVudCA9IGZyYW1lLmNvbXBvbmVudHNbZnJhbWUuY29tcG9uZW50c09yZGVyW2ldXTtcbiAgICAvLyAgIHRoaXMuY29tcG9uZW50cy5wdXNoKHtcbiAgICAvLyAgICAgbGluZXM6IGJ1aWxkQ29tcG9uZW50RGF0YShmcmFtZSwgY29tcG9uZW50KSxcbiAgICAvLyAgICAgc2NhbGVYOiBjb21wb25lbnQuaCAvIGZyYW1lLm1heEgsXG4gICAgLy8gICAgIHNjYWxlWTogY29tcG9uZW50LnYgLyBmcmFtZS5tYXhWXG4gICAgLy8gICB9KTtcbiAgICAvLyB9XG5cbiAgICB0aGlzLnF1YWxpdHkgPSAwO1xuXG4gICAgbGV0IHN1bSA9IDA7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBxdWFudGl6YXRpb25UYWJsZXMubGVuZ3RoOyBpKyspIHtcbiAgICAgIGNvbnN0IHF0YWJsZSA9IHF1YW50aXphdGlvblRhYmxlc1tpXTtcbiAgICAgIGlmIChxdGFibGUpIHtcbiAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCBxdGFibGUubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICBzdW0gKz0gcXRhYmxlW2pdO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHF1YW50aXphdGlvblRhYmxlc1swXSAmJiBxdWFudGl6YXRpb25UYWJsZXNbMV0pIHtcbiAgICAgIGNvbnN0IGhhc2ggPSBbXG4gICAgICAgIDEwMjAsIDEwMTUsIDkzMiwgODQ4LCA3ODAsIDczNSwgNzAyLCA2NzksIDY2MCwgNjQ1LFxuICAgICAgICA2MzIsIDYyMywgNjEzLCA2MDcsIDYwMCwgNTk0LCA1ODksIDU4NSwgNTgxLCA1NzEsXG4gICAgICAgIDU1NSwgNTQyLCA1MjksIDUxNCwgNDk0LCA0NzQsIDQ1NywgNDM5LCA0MjQsIDQxMCxcbiAgICAgICAgMzk3LCAzODYsIDM3MywgMzY0LCAzNTEsIDM0MSwgMzM0LCAzMjQsIDMxNywgMzA5LFxuICAgICAgICAyOTksIDI5NCwgMjg3LCAyNzksIDI3NCwgMjY3LCAyNjIsIDI1NywgMjUxLCAyNDcsXG4gICAgICAgIDI0MywgMjM3LCAyMzIsIDIyNywgMjIyLCAyMTcsIDIxMywgMjA3LCAyMDIsIDE5OCxcbiAgICAgICAgMTkyLCAxODgsIDE4MywgMTc3LCAxNzMsIDE2OCwgMTYzLCAxNTcsIDE1MywgMTQ4LFxuICAgICAgICAxNDMsIDEzOSwgMTMyLCAxMjgsIDEyNSwgMTE5LCAxMTUsIDEwOCwgMTA0LCA5OSxcbiAgICAgICAgOTQsIDkwLCA4NCwgNzksIDc0LCA3MCwgNjQsIDU5LCA1NSwgNDksXG4gICAgICAgIDQ1LCA0MCwgMzQsIDMwLCAyNSwgMjAsIDE1LCAxMSwgNiwgNCxcbiAgICAgICAgMFxuICAgICAgXTtcbiAgICAgIGNvbnN0IHN1bXMgPSBbXG4gICAgICAgIDMyNjQwLCAzMjYzNSwgMzIyNjYsIDMxNDk1LCAzMDY2NSwgMjk4MDQsIDI5MTQ2LCAyODU5OSwgMjgxMDQsXG4gICAgICAgIDI3NjcwLCAyNzIyNSwgMjY3MjUsIDI2MjEwLCAyNTcxNiwgMjUyNDAsIDI0Nzg5LCAyNDM3MywgMjM5NDYsXG4gICAgICAgIDIzNTcyLCAyMjg0NiwgMjE4MDEsIDIwODQyLCAxOTk0OSwgMTkxMjEsIDE4Mzg2LCAxNzY1MSwgMTY5OTgsXG4gICAgICAgIDE2MzQ5LCAxNTgwMCwgMTUyNDcsIDE0NzgzLCAxNDMyMSwgMTM4NTksIDEzNTM1LCAxMzA4MSwgMTI3MDIsXG4gICAgICAgIDEyNDIzLCAxMjA1NiwgMTE3NzksIDExNTEzLCAxMTEzNSwgMTA5NTUsIDEwNjc2LCAxMDM5MiwgMTAyMDgsXG4gICAgICAgIDk5MjgsIDk3NDcsIDk1NjQsIDkzNjksIDkxOTMsIDkwMTcsIDg4MjIsIDg2MzksIDg0NTgsXG4gICAgICAgIDgyNzAsIDgwODQsIDc4OTYsIDc3MTAsIDc1MjcsIDczNDcsIDcxNTYsIDY5NzcsIDY3ODgsXG4gICAgICAgIDY2MDcsIDY0MjIsIDYyMzYsIDYwNTQsIDU4NjcsIDU2ODQsIDU0OTUsIDUzMDUsIDUxMjgsXG4gICAgICAgIDQ5NDUsIDQ3NTEsIDQ2MzgsIDQ0NDIsIDQyNDgsIDQwNjUsIDM4ODgsIDM2OTgsIDM1MDksXG4gICAgICAgIDMzMjYsIDMxMzksIDI5NTcsIDI3NzUsIDI1ODYsIDI0MDUsIDIyMTYsIDIwMzcsIDE4NDYsXG4gICAgICAgIDE2NjYsIDE0ODMsIDEyOTcsIDExMDksIDkyNywgNzM1LCA1NTQsIDM3NSwgMjAxLFxuICAgICAgICAxMjgsIDBcbiAgICAgIF07XG4gICAgICBjb25zdCBxdmFsdWUgPSAoXG4gICAgICAgIHF1YW50aXphdGlvblRhYmxlc1swXVsyXSArXG4gICAgICAgIHF1YW50aXphdGlvblRhYmxlc1swXVs1M10gK1xuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMV1bMF0gK1xuICAgICAgICBxdWFudGl6YXRpb25UYWJsZXNbMV1bNjNdXG4gICAgICApO1xuXG4gICAgICBmb3IgKGkgPSAwOyBpIDwgMTAwOyBpKyspIHtcbiAgICAgICAgaWYgKChxdmFsdWUgPCBoYXNoW2ldKSAmJiAoc3VtIDwgc3Vtc1tpXSkpIHsgY29udGludWU7IH1cbiAgICAgICAgaWYgKCgocXZhbHVlIDw9IGhhc2hbaV0pICYmIChzdW0gPD0gc3Vtc1tpXSkpIHx8IChpID49IDUwKSkge1xuICAgICAgICAgIHRoaXMucXVhbGl0eSA9IGkgKyAxO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAocXVhbnRpemF0aW9uVGFibGVzWzBdKSB7XG4gICAgICBjb25zdCBoYXNoID1cbiAgICAgICAgW1xuICAgICAgICAgIDUxMCwgNTA1LCA0MjIsIDM4MCwgMzU1LCAzMzgsIDMyNiwgMzE4LCAzMTEsIDMwNSxcbiAgICAgICAgICAzMDAsIDI5NywgMjkzLCAyOTEsIDI4OCwgMjg2LCAyODQsIDI4MywgMjgxLCAyODAsXG4gICAgICAgICAgMjc5LCAyNzgsIDI3NywgMjczLCAyNjIsIDI1MSwgMjQzLCAyMzMsIDIyNSwgMjE4LFxuICAgICAgICAgIDIxMSwgMjA1LCAxOTgsIDE5MywgMTg2LCAxODEsIDE3NywgMTcyLCAxNjgsIDE2NCxcbiAgICAgICAgICAxNTgsIDE1NiwgMTUyLCAxNDgsIDE0NSwgMTQyLCAxMzksIDEzNiwgMTMzLCAxMzEsXG4gICAgICAgICAgMTI5LCAxMjYsIDEyMywgMTIwLCAxMTgsIDExNSwgMTEzLCAxMTAsIDEwNywgMTA1LFxuICAgICAgICAgIDEwMiwgMTAwLCA5NywgOTQsIDkyLCA4OSwgODcsIDgzLCA4MSwgNzksXG4gICAgICAgICAgNzYsIDc0LCA3MCwgNjgsIDY2LCA2MywgNjEsIDU3LCA1NSwgNTIsXG4gICAgICAgICAgNTAsIDQ4LCA0NCwgNDIsIDM5LCAzNywgMzQsIDMxLCAyOSwgMjYsXG4gICAgICAgICAgMjQsIDIxLCAxOCwgMTYsIDEzLCAxMSwgOCwgNiwgMywgMixcbiAgICAgICAgICAwXG4gICAgICAgIF07XG4gICAgICBjb25zdCBzdW1zID1cbiAgICAgICAgW1xuICAgICAgICAgIDE2MzIwLCAxNjMxNSwgMTU5NDYsIDE1Mjc3LCAxNDY1NSwgMTQwNzMsIDEzNjIzLCAxMzIzMCwgMTI4NTksXG4gICAgICAgICAgMTI1NjAsIDEyMjQwLCAxMTg2MSwgMTE0NTYsIDExMDgxLCAxMDcxNCwgMTAzNjAsIDEwMDI3LCA5Njc5LFxuICAgICAgICAgIDkzNjgsIDkwNTYsIDg2ODAsIDgzMzEsIDc5OTUsIDc2NjgsIDczNzYsIDcwODQsIDY4MjMsXG4gICAgICAgICAgNjU2MiwgNjM0NSwgNjEyNSwgNTkzOSwgNTc1NiwgNTU3MSwgNTQyMSwgNTI0MCwgNTA4NixcbiAgICAgICAgICA0OTc2LCA0ODI5LCA0NzE5LCA0NjE2LCA0NDYzLCA0MzkzLCA0MjgwLCA0MTY2LCA0MDkyLFxuICAgICAgICAgIDM5ODAsIDM5MDksIDM4MzUsIDM3NTUsIDM2ODgsIDM2MjEsIDM1NDEsIDM0NjcsIDMzOTYsXG4gICAgICAgICAgMzMyMywgMzI0NywgMzE3MCwgMzA5NiwgMzAyMSwgMjk1MiwgMjg3NCwgMjgwNCwgMjcyNyxcbiAgICAgICAgICAyNjU3LCAyNTgzLCAyNTA5LCAyNDM3LCAyMzYyLCAyMjkwLCAyMjExLCAyMTM2LCAyMDY4LFxuICAgICAgICAgIDE5OTYsIDE5MTUsIDE4NTgsIDE3NzMsIDE2OTIsIDE2MjAsIDE1NTIsIDE0NzcsIDEzOTgsXG4gICAgICAgICAgMTMyNiwgMTI1MSwgMTE3OSwgMTEwOSwgMTAzMSwgOTYxLCA4ODQsIDgxNCwgNzM2LFxuICAgICAgICAgIDY2NywgNTkyLCA1MTgsIDQ0MSwgMzY5LCAyOTIsIDIyMSwgMTUxLCA4NixcbiAgICAgICAgICA2NCwgMFxuICAgICAgICBdO1xuXG4gICAgICBjb25zdCBxdmFsdWUgPSAoXG4gICAgICAgIHF1YW50aXphdGlvblRhYmxlc1swXVsyXSArXG4gICAgICAgIHF1YW50aXphdGlvblRhYmxlc1swXVs1M11cbiAgICAgICk7XG5cbiAgICAgIGZvciAoaSA9IDA7IGkgPCAxMDA7IGkrKykge1xuICAgICAgICBpZiAoKHF2YWx1ZSA8IGhhc2hbaV0pICYmIChzdW0gPCBzdW1zW2ldKSkgeyBjb250aW51ZTsgfVxuICAgICAgICBpZiAoKChxdmFsdWUgPD0gaGFzaFtpXSkgJiYgKHN1bSA8PSBzdW1zW2ldKSkgfHwgKGkgPj0gNTApKSB7XG4gICAgICAgICAgdGhpcy5xdWFsaXR5ID0gaSArIDE7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBkZWNvZGVcbn07XG5cbmZ1bmN0aW9uIGRlY29kZShqcGVnRGF0YSwgdXNlck9wdHMgPSB7fSkge1xuICB2YXIgZGVmYXVsdE9wdHMgPSB7XG4gICAgLy8gXCJ1bmRlZmluZWRcIiBtZWFucyBcIkNob29zZSB3aGV0aGVyIHRvIHRyYW5zZm9ybSBjb2xvcnMgYmFzZWQgb24gdGhlIGltYWdl4oCZcyBjb2xvciBtb2RlbC5cIlxuICAgIGNvbG9yVHJhbnNmb3JtOiB1bmRlZmluZWQsXG4gICAgdXNlVEFycmF5OiBmYWxzZSxcbiAgICBmb3JtYXRBc1JHQkE6IHRydWUsXG4gICAgdG9sZXJhbnREZWNvZGluZzogdHJ1ZSxcbiAgICBtYXhSZXNvbHV0aW9uSW5NUDogMjUwLCAvLyBEb24ndCBkZWNvZGUgbW9yZSB0aGFuIDI1MCBtZWdhcGl4ZWxzXG4gICAgbWF4TWVtb3J5VXNhZ2VJbk1COiA1MTIsIC8vIERvbid0IGRlY29kZSBpZiBtZW1vcnkgZm9vdHByaW50IGlzIG1vcmUgdGhhbiA1MTJNQlxuICB9O1xuXG4gIHZhciBvcHRzID0geyAuLi5kZWZhdWx0T3B0cywgLi4udXNlck9wdHMgfTtcbiAgdmFyIGFyciA9IG5ldyBVaW50OEFycmF5KGpwZWdEYXRhKTtcbiAgdmFyIGRlY29kZXIgPSBuZXcgSnBlZ0ltYWdlKCk7XG4gIGRlY29kZXIub3B0cyA9IG9wdHM7XG4gIC8vIElmIHRoaXMgY29uc3RydWN0b3IgZXZlciBzdXBwb3J0cyBhc3luYyBkZWNvZGluZyB0aGlzIHdpbGwgbmVlZCB0byBiZSBkb25lIGRpZmZlcmVudGx5LlxuICAvLyBVbnRpbCB0aGVuLCB0cmVhdGluZyBhcyBzaW5nbGV0b24gbGltaXQgaXMgZmluZS5cbiAgSnBlZ0ltYWdlLnJlc2V0TWF4TWVtb3J5VXNhZ2Uob3B0cy5tYXhNZW1vcnlVc2FnZUluTUIgKiAxMDI0ICogMTAyNCk7XG4gIGRlY29kZXIucGFyc2UoYXJyKTtcblxuICByZXR1cm4gZGVjb2RlclxufVxuIl19