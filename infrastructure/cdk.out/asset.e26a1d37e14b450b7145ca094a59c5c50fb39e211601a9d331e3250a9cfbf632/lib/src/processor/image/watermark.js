"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WatermarkAction = void 0;
const html_entities_1 = require("html-entities");
const sharp = require("sharp");
const __1 = require("..");
const is = require("../../is");
const _base_1 = require("./_base");
class WatermarkAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'watermark';
    }
    beforeNewContext(ctx, params) {
        this.validate(params);
        ctx.features[__1.Features.ReadAllAnimatedFrames] = false;
    }
    validate(params) {
        const opt = {
            text: '',
            t: 100,
            g: 'southeast',
            fill: false,
            rotate: 0,
            size: 40,
            color: '000000',
            image: '',
            auto: false,
            order: 0,
            x: 5,
            y: 5,
            voffset: 0,
            interval: 0,
            align: 0,
            type: 'FZHei-B01',
            shadow: 0,
            halo: '000000',
        };
        for (const param of params) {
            if ((this.name === param) || (!param)) {
                continue;
            }
            const [k, v] = (0, _base_1.split1)(param, '_');
            if (k === 'text') {
                if (v) {
                    const buff = Buffer.from(v, 'base64url');
                    opt.text = buff.toString('utf-8');
                }
            }
            else if (k === 'image') {
                if (v) {
                    const buff = Buffer.from(v, 'base64url');
                    opt.image = buff.toString('utf-8');
                }
            }
            else if (k === 't') {
                opt.t = Number.parseInt(v, 10);
            }
            else if (k === 'x') {
                opt.x = Number.parseInt(v, 10);
                if (opt.x < 0 || opt.x > 4096) {
                    throw new __1.InvalidArgument('Watermark param \'x\' must be between 0 and 4096');
                }
            }
            else if (k === 'y') {
                opt.y = Number.parseInt(v, 10);
                if (opt.y < 0 || opt.y > 4096) {
                    throw new __1.InvalidArgument('Watermark param \'y\' must be between 0 and 4096');
                }
            }
            else if (k === 'voffset') {
                opt.voffset = Number.parseInt(v, 10);
                if (opt.voffset < -1000 || opt.voffset > 1000) {
                    throw new __1.InvalidArgument('Watermark param \'voffset\' must be between -1000 and 1000');
                }
            }
            else if (k === 'order') {
                opt.order = Number.parseInt(v, 10);
            }
            else if (k === 'interval') {
                opt.interval = Number.parseInt(v, 10);
                if (opt.interval < 0 || opt.interval > 1000) {
                    throw new __1.InvalidArgument('Watermark param \'interval\' must be between 0 and 1000');
                }
            }
            else if (k === 'align') {
                opt.align = Number.parseInt(v, 10);
            }
            else if (k === 'g') {
                opt.g = this.gravityConvert(v);
            }
            else if (k === 'size') {
                const size = Number.parseInt(v, 10);
                opt.size = size;
                if (opt.size < 0 || opt.size > 1000) {
                    throw new __1.InvalidArgument('Watermark param \'size\' must be between 0 and 4096');
                }
            }
            else if (k === 'fill') {
                if (v && (v === '0' || v === '1')) {
                    opt.fill = (v === '1');
                }
                else {
                    throw new __1.InvalidArgument('Watermark param \'fill\' must be 0 or 1');
                }
            }
            else if (k === 'auto') {
                if (v && (v === '0' || v === '1')) {
                    opt.auto = (v === '1');
                }
                else {
                    throw new __1.InvalidArgument('Watermark param \'auto\' must be 0 or 1');
                }
            }
            else if (k === 'rotate') {
                const rotate = Number.parseInt(v, 10);
                if (0 <= rotate && 360 >= rotate) {
                    if (rotate === 360) {
                        opt.rotate = 0;
                    }
                    else {
                        opt.rotate = rotate;
                    }
                }
                else {
                    throw new __1.InvalidArgument('Watermark param \'rotate\' must be between 0 and 360');
                }
            }
            else if (k === 'color') {
                opt.color = v;
            }
            else if (k === 'type') {
                if (v) {
                    const buff = Buffer.from(v, 'base64url');
                    opt.type = buff.toString('utf-8');
                }
            }
            else if (k === 'shadow') {
                const shadow = Number.parseInt(v, 10);
                if (is.inRange(shadow, 0, 100)) {
                    opt.shadow = shadow;
                }
                else {
                    throw new __1.InvalidArgument('Watermark param \'shadow\' must be between 0 and 100');
                }
            }
            else if (k === 'halo') {
                opt.halo = v;
            }
            else {
                throw new __1.InvalidArgument(`Unkown param: "${k}"`);
            }
        }
        if (!opt.text && !opt.image) {
            throw new __1.InvalidArgument('Watermark param \'text\' and \'image\' should not be empty at the same time');
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        if (opt.text && opt.image) {
            await this.mixedWaterMark(ctx, opt);
        }
        else if (opt.text) {
            await this.textWaterMark(ctx, opt);
        }
        else {
            await this.imgWaterMark(ctx, opt);
        }
    }
    async textWaterMark(ctx, opt) {
        const overlapImg = await this.textImg(opt);
        await this.compositeImg(ctx, overlapImg, opt);
    }
    async imgWaterMark(ctx, opt) {
        const bs = ctx.bufferStore;
        const watermarkImgBuffer = (await bs.get(opt.image)).buffer;
        let watermarkImg = sharp(watermarkImgBuffer).png();
        await this.compositeImg(ctx, watermarkImg, opt);
    }
    async compositeImg(ctx, watermarkImg, opt, double_auto = false) {
        if (0 < opt.rotate) {
            if (double_auto) {
                watermarkImg = await this.autoResize(ctx, watermarkImg, opt);
            }
            watermarkImg = watermarkImg.rotate(opt.rotate, { background: '#00000000' });
        }
        // auto scale warkmark size
        watermarkImg = await this.autoResize(ctx, watermarkImg, opt);
        const metadata = withNormalSize(ctx.metadata);
        const markMetadata = await watermarkImg.metadata();
        const pos = this.calculateImgPos(opt, metadata, markMetadata);
        const overlay = await this.extraImgOverlay(watermarkImg, opt, pos);
        ctx.image.composite([overlay]);
    }
    async mixedWaterMark(ctx, opt) {
        const bs = ctx.bufferStore;
        const txtImg = (await this.textImg(opt)).png();
        const txtMeta = await txtImg.metadata();
        const txtW = txtMeta.width ? txtMeta.width : 0;
        const txtH = txtMeta.height ? txtMeta.height : 0;
        const txtbt = await txtImg.toBuffer();
        const watermarkImgBuffer = (await bs.get(opt.image)).buffer;
        const watermarkImg = sharp(watermarkImgBuffer).png();
        const imgMetadata = await watermarkImg.metadata();
        const imgW = imgMetadata.width ? imgMetadata.width : 0;
        const imgH = imgMetadata.height ? imgMetadata.height : 0;
        const gravityOpt = this.calculateMixedGravity(opt);
        const wbt = await watermarkImg.toBuffer();
        const expectedWidth = txtW + imgW + opt.interval;
        const expectedHeight = Math.max(txtH, imgH);
        let overlapImg = sharp({
            create: {
                width: expectedWidth,
                height: expectedHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        }).composite([{ input: txtbt, gravity: gravityOpt.textGravity }, { input: wbt, gravity: gravityOpt.imgGravity }]);
        await this.compositeImg(ctx, overlapImg, opt, true);
    }
    gravityConvert(param) {
        if (['north', 'west', 'east', 'south', 'center', 'centre', 'southeast', 'southwest', 'northwest'].includes(param)) {
            return param;
        }
        else if (param === 'se') {
            return 'southeast';
        }
        else if (param === 'sw') {
            return 'southwest';
        }
        else if (param === 'nw') {
            return 'northwest';
        }
        else if (param === 'ne') {
            return 'northeast';
        }
        else {
            throw new __1.InvalidArgument('Watermark param \'g\' must be in \'north\', \'west\', \'east\', \'south\', \'center\', \'centre\', \'southeast\', \'southwest\', \'northwest\'');
        }
    }
    async textImg(opt) {
        const safetext = (0, html_entities_1.encode)(opt.text);
        const o = sharp({
            text: {
                text: `<span size="${opt.size}pt" foreground="#${opt.color}">${safetext}</span>`,
                align: 'center',
                rgba: true,
                dpi: 72,
            },
        });
        if (opt.shadow === 0) {
            return o;
        }
        const meta = await o.metadata();
        const offset = 2;
        let expectedWidth = offset;
        let expectedHeight = offset;
        if (meta.width && meta.height) {
            expectedWidth += meta.width;
            expectedHeight += meta.height;
        }
        const shadow = sharp({
            text: {
                text: `<span size="${opt.size}pt" foreground="#${opt.halo}">${safetext}</span>`,
                align: 'center',
                rgba: true,
                dpi: 72,
            },
        });
        const oBuffer = await o.png().toBuffer();
        const opacity = opt.shadow / 100;
        const copy = await shadow.png().ensureAlpha(opacity).toBuffer();
        const u = await sharp({
            create: {
                width: expectedWidth,
                height: expectedHeight,
                channels: 4,
                background: { r: 0, g: 0, b: 0, alpha: 0 },
            },
        }).composite([{ input: copy, left: offset, top: offset }]).png().toBuffer();
        const bt = sharp(u).png().composite([{ input: oBuffer, gravity: 'northwest' }]);
        return sharp(await bt.toBuffer()).png();
    }
    calculateImgPos(opt, metadata, markMetadata) {
        return this.calculatePos(opt, metadata.width, metadata.height, markMetadata.width, markMetadata.height);
    }
    calculatePos(opt, sourceW, sourceH, markW, markH) {
        let imgX = undefined;
        let imgY = undefined;
        if (markW && sourceW && markH && sourceH) {
            if (['east', 'west', 'center'].includes(opt.g)) {
                imgY = Math.round((sourceH - markH) / 2) + opt.voffset;
            }
            else {
                const checkY = opt.y ? opt.y : 0;
                if (opt.g.startsWith('south')) {
                    imgY = sourceH - markH - checkY;
                }
                else {
                    imgY = checkY;
                }
            }
            if (['north', 'south'].includes(opt.g)) {
                imgX = Math.round((sourceW - markW) / 2);
                if (!imgY) {
                    if (opt.g === 'north') {
                        imgY = 0;
                    }
                    else {
                        imgY = sourceH - markH;
                    }
                }
            }
            else {
                const checkX = opt.x ? opt.x : 0;
                if (opt.g.endsWith('east')) {
                    imgX = sourceW - markW - checkX;
                }
                else if (opt.g === 'center') {
                    imgX = Math.round((sourceW - markW) / 2);
                }
                else {
                    imgX = checkX;
                }
            }
        }
        return {
            x: imgX,
            y: imgY,
        };
    }
    calculateMixedGravity(opt) {
        let imgGravity = 'west';
        let txtGravity = 'east';
        if (opt.order === 1) {
            if (opt.align === 1) {
                imgGravity = 'east';
                txtGravity = 'west';
            }
            else if (opt.align === 2) {
                imgGravity = 'southeast';
                txtGravity = 'southwest';
            }
            else {
                imgGravity = 'northeast';
                txtGravity = 'northwest';
            }
        }
        else {
            if (opt.align === 1) {
                imgGravity = 'west';
                txtGravity = 'east';
            }
            else if (opt.align === 2) {
                imgGravity = 'southwest';
                txtGravity = 'southeast';
            }
            else {
                imgGravity = 'northwest';
                txtGravity = 'northeast';
            }
        }
        return {
            imgGravity: imgGravity,
            textGravity: txtGravity,
        };
    }
    async autoResize(ctx, mark, opt) {
        mark = sharp(await mark.png().toBuffer());
        const mmeta = await mark.metadata();
        const metadata = withNormalSize(ctx.metadata);
        if (!mmeta.width || !metadata.width || !mmeta.height || !metadata.height) {
            throw new Error('failed to get width or height in metadata!');
        }
        if (opt.auto) {
            // renew a sharp object, otherwise the metadata is not right after rotate, resize etc.
            let wratio = 1;
            let hratio = 1;
            let needResize = false;
            if (mmeta.width > metadata.width) {
                wratio = (metadata.width - 5) / mmeta.width;
                needResize = true;
            }
            if (mmeta.height > metadata.height) {
                hratio = (metadata.height - 5) / mmeta.height;
                needResize = true;
            }
            if (needResize && mmeta.height && mmeta.width) {
                const change = Math.min(wratio, hratio);
                const w = Math.floor(mmeta.width * change);
                const h = Math.floor(mmeta.height * change);
                mark = sharp(await mark.resize(w, h).png().toBuffer());
            }
        }
        else {
            let needCrop = false;
            let left = 0;
            let top = 0;
            let width = mmeta.width;
            let height = mmeta.height;
            const px = opt.x ? opt.x : 0;
            const py = opt.y ? opt.y : 0;
            if (mmeta.width > metadata.width) {
                if (opt.g.endsWith('west')) {
                    left = 0;
                    width = metadata.width - px;
                }
                else if (opt.g.endsWith('east')) {
                    left = mmeta.width + px - metadata.width;
                    width = metadata.width - px;
                }
                else {
                    left = Math.floor((mmeta.width - metadata.width) / 2);
                    width = metadata.width;
                }
                needCrop = true;
            }
            // 'north', 'south'
            if (mmeta.height > metadata.height) {
                if (opt.g.startsWith('north')) {
                    top = 0;
                    height = metadata.height - py;
                }
                else if (opt.g.startsWith('south')) {
                    top = mmeta.height + py - metadata.height;
                    height = metadata.height - py;
                }
                else {
                    top = Math.floor((mmeta.height - metadata.height) / 2);
                    height = metadata.height;
                }
                needCrop = true;
            }
            if (needCrop) {
                mark = sharp(await mark.extract({ left: left, top: top, width: width, height: height }).png().toBuffer());
            }
        }
        return mark;
    }
    async extraImgOverlay(markImg, opt, pos) {
        if (opt.t < 100) {
            markImg = markImg.convolve({
                width: 3,
                height: 3,
                kernel: [
                    0, 0, 0,
                    0, opt.t / 100, 0,
                    0, 0, 0,
                ],
            });
        }
        const bt = await markImg.png().toBuffer();
        const overlay = { input: bt, tile: opt.fill, gravity: opt.g };
        if (pos) {
            overlay.top = pos.y;
            overlay.left = pos.x;
        }
        return overlay;
    }
}
exports.WatermarkAction = WatermarkAction;
function withNormalSize(metadata) {
    const o = Object.assign({}, metadata);
    if ((metadata.orientation || 0) >= 5) {
        [o.width, o.height] = [o.height, o.width];
    }
    return o;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2F0ZXJtYXJrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci9pbWFnZS93YXRlcm1hcmsudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsaURBQXVDO0FBQ3ZDLCtCQUErQjtBQUUvQiwwQkFBdUY7QUFDdkYsK0JBQStCO0FBQy9CLG1DQUFrRDtBQWtDbEQsTUFBYSxlQUFnQixTQUFRLHVCQUFlO0lBQXBEOztRQUNrQixTQUFJLEdBQVcsV0FBVyxDQUFDO0lBdWM3QyxDQUFDO0lBcmNRLGdCQUFnQixDQUFDLEdBQW9CLEVBQUUsTUFBZ0I7UUFDNUQsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN0QixHQUFHLENBQUMsUUFBUSxDQUFDLFlBQVEsQ0FBQyxxQkFBcUIsQ0FBQyxHQUFHLEtBQUssQ0FBQztJQUN2RCxDQUFDO0lBRU0sUUFBUSxDQUFDLE1BQWdCO1FBQzlCLE1BQU0sR0FBRyxHQUFrQjtZQUN6QixJQUFJLEVBQUUsRUFBRTtZQUNSLENBQUMsRUFBRSxHQUFHO1lBQ04sQ0FBQyxFQUFFLFdBQVc7WUFDZCxJQUFJLEVBQUUsS0FBSztZQUNYLE1BQU0sRUFBRSxDQUFDO1lBQ1QsSUFBSSxFQUFFLEVBQUU7WUFDUixLQUFLLEVBQUUsUUFBUTtZQUNmLEtBQUssRUFBRSxFQUFFO1lBQ1QsSUFBSSxFQUFFLEtBQUs7WUFDWCxLQUFLLEVBQUUsQ0FBQztZQUNSLENBQUMsRUFBRSxDQUFDO1lBQ0osQ0FBQyxFQUFFLENBQUM7WUFDSixPQUFPLEVBQUUsQ0FBQztZQUNWLFFBQVEsRUFBRSxDQUFDO1lBQ1gsS0FBSyxFQUFFLENBQUM7WUFDUixJQUFJLEVBQUUsV0FBVztZQUNqQixNQUFNLEVBQUUsQ0FBQztZQUNULElBQUksRUFBRSxRQUFRO1NBQ2YsQ0FBQztRQUVGLEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFO1lBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMs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ImltcG9ydCB7IGVuY29kZSB9IGZyb20gJ2h0bWwtZW50aXRpZXMnO1xuaW1wb3J0ICogYXMgc2hhcnAgZnJvbSAnc2hhcnAnO1xuaW1wb3J0IHsgSUltYWdlQ29udGV4dCB9IGZyb20gJy4nO1xuaW1wb3J0IHsgSUFjdGlvbk9wdHMsIFJlYWRPbmx5LCBJbnZhbGlkQXJndW1lbnQsIEZlYXR1cmVzLCBJUHJvY2Vzc0NvbnRleHQgfSBmcm9tICcuLic7XG5pbXBvcnQgKiBhcyBpcyBmcm9tICcuLi8uLi9pcyc7XG5pbXBvcnQgeyBCYXNlSW1hZ2VBY3Rpb24sIHNwbGl0MSB9IGZyb20gJy4vX2Jhc2UnO1xuXG5cbmV4cG9ydCBpbnRlcmZhY2UgV2F0ZXJtYXJrT3B0cyBleHRlbmRzIElBY3Rpb25PcHRzIHtcbiAgdGV4dDogc3RyaW5nO1xuICB0OiBudW1iZXI7IC8vIOS4jemAj+aYjuW6plxuICBnOiBzdHJpbmc7IC8vIOS9jee9rlxuICBmaWxsOiBib29sZWFuOyAvLyDmloflrZfmmK/lkKbph43lpI1cbiAgcm90YXRlOiBudW1iZXI7IC8vIOaWh+Wtl+aXi+i9rOinkuW6plxuICBzaXplOiBudW1iZXI7IC8vIOaWh+Wtl+Wkp+Wwj1xuICBjb2xvcjogc3RyaW5nOyAvLyDmloflrZfpopzoibJcbiAgaW1hZ2U6IHN0cmluZzsgLy8gaW1nIOawtOWNsFVSTFxuICBhdXRvOiBib29sZWFuOyAvLyDoh6rliqjosIPmlbTmsLTljbDlm77niYflpKflsI/ku6XpgILlupTog4zmma9cbiAgeD86IG51bWJlcjsgLy8g5Zu+5paH5rC05Y2w55qEeOS9jee9rlxuICB5PzogbnVtYmVyOyAvLyDlm77mlofmsLTljbDnmoR55L2N572uXG4gIHZvZmZzZXQ6IG51bWJlcjsgLy8g5Zu+5paH5rC05Y2w55qE5bGF5Lit5pe25YCZ55qE5YGP56e75L2N572uXG4gIG9yZGVyOiBudW1iZXI7IC8vIOWbvuaWh+a3t+aOkuS4re+8jOaWh+Wtl+WbvueJh+eahOWFiOWQjumhuuW6j1xuICBpbnRlcnZhbDogbnVtYmVyOyAvLyDlm77mlofmt7fmjpLkuK3vvIzlm77niYflkozmloflrZfpl7TpmpRcbiAgYWxpZ246IG51bWJlcjsgLy8g5Zu+5paH5re35o6S5Lit77yM5Zu+54mH5ZKM5paH5a2X5a+55YW25pa55byPXG4gIHR5cGU6IHN0cmluZzsgLy8g5a2X5L2TXG4gIHNoYWRvdzogbnVtYmVyO1xuICBoYWxvOiBzdHJpbmc7IC8vIHNoYWRvdyDpopzoibJcbn1cblxuaW50ZXJmYWNlIFdhdGVybWFya1Bvc09wdHMgZXh0ZW5kcyBJQWN0aW9uT3B0cyB7XG4gIHg/OiBudW1iZXI7XG4gIHk/OiBudW1iZXI7XG59XG5cbmludGVyZmFjZSBXYXRlcm1hcmtNaXhlZEdyYXZpdHlPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBpbWdHcmF2aXR5OiBzdHJpbmc7XG4gIHRleHRHcmF2aXR5OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBXYXRlcm1hcmtBY3Rpb24gZXh0ZW5kcyBCYXNlSW1hZ2VBY3Rpb24ge1xuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ3dhdGVybWFyayc7XG5cbiAgcHVibGljIGJlZm9yZU5ld0NvbnRleHQoY3R4OiBJUHJvY2Vzc0NvbnRleHQsIHBhcmFtczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICB0aGlzLnZhbGlkYXRlKHBhcmFtcyk7XG4gICAgY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLlJlYWRBbGxBbmltYXRlZEZyYW1lc10gPSBmYWxzZTtcbiAgfVxuXG4gIHB1YmxpYyB2YWxpZGF0ZShwYXJhbXM6IHN0cmluZ1tdKTogUmVhZE9ubHk8V2F0ZXJtYXJrT3B0cz4ge1xuICAgIGNvbnN0IG9wdDogV2F0ZXJtYXJrT3B0cyA9IHtcbiAgICAgIHRleHQ6ICcnLFxuICAgICAgdDogMTAwLFxuICAgICAgZzogJ3NvdXRoZWFzdCcsXG4gICAgICBmaWxsOiBmYWxzZSxcbiAgICAgIHJvdGF0ZTogMCxcbiAgICAgIHNpemU6IDQwLFxuICAgICAgY29sb3I6ICcwMDAwMDAnLFxuICAgICAgaW1hZ2U6ICcnLFxuICAgICAgYXV0bzogZmFsc2UsXG4gICAgICBvcmRlcjogMCxcbiAgICAgIHg6IDUsXG4gICAgICB5OiA1LFxuICAgICAgdm9mZnNldDogMCxcbiAgICAgIGludGVydmFsOiAwLFxuICAgICAgYWxpZ246IDAsXG4gICAgICB0eXBlOiAnRlpIZWktQjAxJyxcbiAgICAgIHNoYWRvdzogMCxcbiAgICAgIGhhbG86ICcwMDAwMDAnLFxuICAgIH07XG5cbiAgICBmb3IgKGNvbnN0IHBhcmFtIG9mIHBhcmFtcykge1xuICAgICAgaWYgKCh0aGlzLm5hbWUgPT09IHBhcmFtKSB8fCAoIXBhcmFtKSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtrLCB2XSA9IHNwbGl0MShwYXJhbSwgJ18nKTtcbiAgICAgIGlmIChrID09PSAndGV4dCcpIHtcbiAgICAgICAgaWYgKHYpIHtcbiAgICAgICAgICBjb25zdCBidWZmID0gQnVmZmVyLmZyb20odiwgJ2Jhc2U2NHVybCcpO1xuICAgICAgICAgIG9wdC50ZXh0ID0gYnVmZi50b1N0cmluZygndXRmLTgnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChrID09PSAnaW1hZ2UnKSB7XG4gICAgICAgIGlmICh2KSB7XG4gICAgICAgICAgY29uc3QgYnVmZiA9IEJ1ZmZlci5mcm9tKHYsICdiYXNlNjR1cmwnKTtcbiAgICAgICAgICBvcHQuaW1hZ2UgPSBidWZmLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICd0Jykge1xuICAgICAgICBvcHQudCA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICd4Jykge1xuICAgICAgICBvcHQueCA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICAgIGlmIChvcHQueCA8IDAgfHwgb3B0LnggPiA0MDk2KSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ3hcXCcgbXVzdCBiZSBiZXR3ZWVuIDAgYW5kIDQwOTYnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChrID09PSAneScpIHtcbiAgICAgICAgb3B0LnkgPSBOdW1iZXIucGFyc2VJbnQodiwgMTApO1xuICAgICAgICBpZiAob3B0LnkgPCAwIHx8IG9wdC55ID4gNDA5Nikge1xuICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1dhdGVybWFyayBwYXJhbSBcXCd5XFwnIG11c3QgYmUgYmV0d2VlbiAwIGFuZCA0MDk2Jyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoayA9PT0gJ3ZvZmZzZXQnKSB7XG4gICAgICAgIG9wdC52b2Zmc2V0ID0gTnVtYmVyLnBhcnNlSW50KHYsIDEwKTtcbiAgICAgICAgaWYgKG9wdC52b2Zmc2V0IDwgLTEwMDAgfHwgb3B0LnZvZmZzZXQgPiAxMDAwKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ3ZvZmZzZXRcXCcgbXVzdCBiZSBiZXR3ZWVuIC0xMDAwIGFuZCAxMDAwJyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoayA9PT0gJ29yZGVyJykge1xuICAgICAgICBvcHQub3JkZXIgPSBOdW1iZXIucGFyc2VJbnQodiwgMTApO1xuICAgICAgfSBlbHNlIGlmIChrID09PSAnaW50ZXJ2YWwnKSB7XG4gICAgICAgIG9wdC5pbnRlcnZhbCA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICAgIGlmIChvcHQuaW50ZXJ2YWwgPCAwIHx8IG9wdC5pbnRlcnZhbCA+IDEwMDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdXYXRlcm1hcmsgcGFyYW0gXFwnaW50ZXJ2YWxcXCcgbXVzdCBiZSBiZXR3ZWVuIDAgYW5kIDEwMDAnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChrID09PSAnYWxpZ24nKSB7XG4gICAgICAgIG9wdC5hbGlnbiA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdnJykge1xuICAgICAgICBvcHQuZyA9IHRoaXMuZ3Jhdml0eUNvbnZlcnQodik7XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdzaXplJykge1xuICAgICAgICBjb25zdCBzaXplID0gTnVtYmVyLnBhcnNlSW50KHYsIDEwKTtcbiAgICAgICAgb3B0LnNpemUgPSBzaXplO1xuICAgICAgICBpZiAob3B0LnNpemUgPCAwIHx8IG9wdC5zaXplID4gMTAwMCkge1xuICAgICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1dhdGVybWFyayBwYXJhbSBcXCdzaXplXFwnIG11c3QgYmUgYmV0d2VlbiAwIGFuZCA0MDk2Jyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoayA9PT0gJ2ZpbGwnKSB7XG4gICAgICAgIGlmICh2ICYmICh2ID09PSAnMCcgfHwgdiA9PT0gJzEnKSkge1xuICAgICAgICAgIG9wdC5maWxsID0gKHYgPT09ICcxJyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ2ZpbGxcXCcgbXVzdCBiZSAwIG9yIDEnKTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIGlmIChrID09PSAnYXV0bycpIHtcbiAgICAgICAgaWYgKHYgJiYgKHYgPT09ICcwJyB8fCB2ID09PSAnMScpKSB7XG4gICAgICAgICAgb3B0LmF1dG8gPSAodiA9PT0gJzEnKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdXYXRlcm1hcmsgcGFyYW0gXFwnYXV0b1xcJyBtdXN0IGJlIDAgb3IgMScpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdyb3RhdGUnKSB7XG4gICAgICAgIGNvbnN0IHJvdGF0ZSA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICAgIGlmICgwIDw9IHJvdGF0ZSAmJiAzNjAgPj0gcm90YXRlKSB7XG4gICAgICAgICAgaWYgKHJvdGF0ZSA9PT0gMzYwKSB7XG4gICAgICAgICAgICBvcHQucm90YXRlID0gMDtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgb3B0LnJvdGF0ZSA9IHJvdGF0ZTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ3JvdGF0ZVxcJyBtdXN0IGJlIGJldHdlZW4gMCBhbmQgMzYwJyk7XG4gICAgICAgIH1cblxuICAgICAgfSBlbHNlIGlmIChrID09PSAnY29sb3InKSB7XG4gICAgICAgIG9wdC5jb2xvciA9IHY7XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICd0eXBlJykge1xuICAgICAgICBpZiAodikge1xuICAgICAgICAgIGNvbnN0IGJ1ZmYgPSBCdWZmZXIuZnJvbSh2LCAnYmFzZTY0dXJsJyk7XG4gICAgICAgICAgb3B0LnR5cGUgPSBidWZmLnRvU3RyaW5nKCd1dGYtOCcpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2UgaWYgKGsgPT09ICdzaGFkb3cnKSB7XG4gICAgICAgIGNvbnN0IHNoYWRvdyA9IE51bWJlci5wYXJzZUludCh2LCAxMCk7XG4gICAgICAgIGlmIChpcy5pblJhbmdlKHNoYWRvdywgMCwgMTAwKSkge1xuICAgICAgICAgIG9wdC5zaGFkb3cgPSBzaGFkb3c7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ3NoYWRvd1xcJyBtdXN0IGJlIGJldHdlZW4gMCBhbmQgMTAwJyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSBpZiAoayA9PT0gJ2hhbG8nKSB7XG4gICAgICAgIG9wdC5oYWxvID0gdjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoYFVua293biBwYXJhbTogXCIke2t9XCJgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgaWYgKCFvcHQudGV4dCAmJiAhb3B0LmltYWdlKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdXYXRlcm1hcmsgcGFyYW0gXFwndGV4dFxcJyBhbmQgXFwnaW1hZ2VcXCcgc2hvdWxkIG5vdCBiZSBlbXB0eSBhdCB0aGUgc2FtZSB0aW1lJyk7XG4gICAgfVxuXG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuXG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJSW1hZ2VDb250ZXh0LCBwYXJhbXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3B0ID0gdGhpcy52YWxpZGF0ZShwYXJhbXMpO1xuICAgIGlmIChvcHQudGV4dCAmJiBvcHQuaW1hZ2UpIHtcbiAgICAgIGF3YWl0IHRoaXMubWl4ZWRXYXRlck1hcmsoY3R4LCBvcHQpO1xuICAgIH0gZWxzZSBpZiAob3B0LnRleHQpIHtcbiAgICAgIGF3YWl0IHRoaXMudGV4dFdhdGVyTWFyayhjdHgsIG9wdCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGF3YWl0IHRoaXMuaW1nV2F0ZXJNYXJrKGN0eCwgb3B0KTtcbiAgICB9XG4gIH1cblxuICBhc3luYyB0ZXh0V2F0ZXJNYXJrKGN0eDogSUltYWdlQ29udGV4dCwgb3B0OiBXYXRlcm1hcmtPcHRzKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3ZlcmxhcEltZyA9IGF3YWl0IHRoaXMudGV4dEltZyhvcHQpO1xuXG4gICAgYXdhaXQgdGhpcy5jb21wb3NpdGVJbWcoY3R4LCBvdmVybGFwSW1nLCBvcHQpO1xuXG4gIH1cblxuICBhc3luYyBpbWdXYXRlck1hcmsoY3R4OiBJSW1hZ2VDb250ZXh0LCBvcHQ6IFdhdGVybWFya09wdHMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBicyA9IGN0eC5idWZmZXJTdG9yZTtcblxuICAgIGNvbnN0IHdhdGVybWFya0ltZ0J1ZmZlciA9IChhd2FpdCBicy5nZXQob3B0LmltYWdlKSkuYnVmZmVyO1xuICAgIGxldCB3YXRlcm1hcmtJbWcgPSBzaGFycCh3YXRlcm1hcmtJbWdCdWZmZXIpLnBuZygpO1xuXG4gICAgYXdhaXQgdGhpcy5jb21wb3NpdGVJbWcoY3R4LCB3YXRlcm1hcmtJbWcsIG9wdCk7XG4gIH1cblxuICBhc3luYyBjb21wb3NpdGVJbWcoY3R4OiBJSW1hZ2VDb250ZXh0LCB3YXRlcm1hcmtJbWc6IHNoYXJwLlNoYXJwLCBvcHQ6IFdhdGVybWFya09wdHMsIGRvdWJsZV9hdXRvOiBCb29sZWFuID0gZmFsc2UpOiBQcm9taXNlPHZvaWQ+IHtcblxuICAgIGlmICgwIDwgb3B0LnJvdGF0ZSkge1xuICAgICAgaWYgKGRvdWJsZV9hdXRvKSB7XG4gICAgICAgIHdhdGVybWFya0ltZyA9IGF3YWl0IHRoaXMuYXV0b1Jlc2l6ZShjdHgsIHdhdGVybWFya0ltZywgb3B0KTtcbiAgICAgIH1cblxuICAgICAgd2F0ZXJtYXJrSW1nID0gd2F0ZXJtYXJrSW1nLnJvdGF0ZShvcHQucm90YXRlLCB7IGJhY2tncm91bmQ6ICcjMDAwMDAwMDAnIH0pO1xuICAgIH1cblxuICAgIC8vIGF1dG8gc2NhbGUgd2Fya21hcmsgc2l6ZVxuICAgIHdhdGVybWFya0ltZyA9IGF3YWl0IHRoaXMuYXV0b1Jlc2l6ZShjdHgsIHdhdGVybWFya0ltZywgb3B0KTtcblxuICAgIGNvbnN0IG1ldGFkYXRhID0gd2l0aE5vcm1hbFNpemUoY3R4Lm1ldGFkYXRhKTtcbiAgICBjb25zdCBtYXJrTWV0YWRhdGEgPSBhd2FpdCB3YXRlcm1hcmtJbWcubWV0YWRhdGEoKTtcblxuICAgIGNvbnN0IHBvcyA9IHRoaXMuY2FsY3VsYXRlSW1nUG9zKG9wdCwgbWV0YWRhdGEsIG1hcmtNZXRhZGF0YSk7XG5cbiAgICBjb25zdCBvdmVybGF5ID0gYXdhaXQgdGhpcy5leHRyYUltZ092ZXJsYXkod2F0ZXJtYXJrSW1nLCBvcHQsIHBvcyk7XG4gICAgY3R4LmltYWdlLmNvbXBvc2l0ZShbb3ZlcmxheV0pO1xuICB9XG5cbiAgYXN5bmMgbWl4ZWRXYXRlck1hcmsoY3R4OiBJSW1hZ2VDb250ZXh0LCBvcHQ6IFdhdGVybWFya09wdHMpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBicyA9IGN0eC5idWZmZXJTdG9yZTtcblxuICAgIGNvbnN0IHR4dEltZyA9IChhd2FpdCB0aGlzLnRleHRJbWcob3B0KSkucG5nKCk7XG4gICAgY29uc3QgdHh0TWV0YSA9IGF3YWl0IHR4dEltZy5tZXRhZGF0YSgpO1xuXG4gICAgY29uc3QgdHh0VyA9IHR4dE1ldGEud2lkdGggPyB0eHRNZXRhLndpZHRoIDogMDtcbiAgICBjb25zdCB0eHRIID0gdHh0TWV0YS5oZWlnaHQgPyB0eHRNZXRhLmhlaWdodCA6IDA7XG5cbiAgICBjb25zdCB0eHRidCA9IGF3YWl0IHR4dEltZy50b0J1ZmZlcigpO1xuXG4gICAgY29uc3Qgd2F0ZXJtYXJrSW1nQnVmZmVyID0gKGF3YWl0IGJzLmdldChvcHQuaW1hZ2UpKS5idWZmZXI7XG4gICAgY29uc3Qgd2F0ZXJtYXJrSW1nID0gc2hhcnAod2F0ZXJtYXJrSW1nQnVmZmVyKS5wbmcoKTtcbiAgICBjb25zdCBpbWdNZXRhZGF0YSA9IGF3YWl0IHdhdGVybWFya0ltZy5tZXRhZGF0YSgpO1xuICAgIGNvbnN0IGltZ1cgPSBpbWdNZXRhZGF0YS53aWR0aCA/IGltZ01ldGFkYXRhLndpZHRoIDogMDtcbiAgICBjb25zdCBpbWdIID0gaW1nTWV0YWRhdGEuaGVpZ2h0ID8gaW1nTWV0YWRhdGEuaGVpZ2h0IDogMDtcblxuICAgIGNvbnN0IGdyYXZpdHlPcHQgPSB0aGlzLmNhbGN1bGF0ZU1peGVkR3Jhdml0eShvcHQpO1xuICAgIGNvbnN0IHdidCA9IGF3YWl0IHdhdGVybWFya0ltZy50b0J1ZmZlcigpO1xuXG4gICAgY29uc3QgZXhwZWN0ZWRXaWR0aCA9IHR4dFcgKyBpbWdXICsgb3B0LmludGVydmFsO1xuICAgIGNvbnN0IGV4cGVjdGVkSGVpZ2h0ID0gTWF0aC5tYXgodHh0SCwgaW1nSCk7XG5cbiAgICBsZXQgb3ZlcmxhcEltZyA9IHNoYXJwKHtcbiAgICAgIGNyZWF0ZToge1xuICAgICAgICB3aWR0aDogZXhwZWN0ZWRXaWR0aCxcbiAgICAgICAgaGVpZ2h0OiBleHBlY3RlZEhlaWdodCxcbiAgICAgICAgY2hhbm5lbHM6IDQsXG4gICAgICAgIGJhY2tncm91bmQ6IHsgcjogMCwgZzogMCwgYjogMCwgYWxwaGE6IDAgfSxcbiAgICAgIH0sXG4gICAgfSkuY29tcG9zaXRlKFt7IGlucHV0OiB0eHRidCwgZ3Jhdml0eTogZ3Jhdml0eU9wdC50ZXh0R3Jhdml0eSB9LCB7IGlucHV0OiB3YnQsIGdyYXZpdHk6IGdyYXZpdHlPcHQuaW1nR3Jhdml0eSB9XSk7XG5cbiAgICBhd2FpdCB0aGlzLmNvbXBvc2l0ZUltZyhjdHgsIG92ZXJsYXBJbWcsIG9wdCwgdHJ1ZSk7XG4gIH1cblxuICBncmF2aXR5Q29udmVydChwYXJhbTogc3RyaW5nKTogc3RyaW5nIHtcbiAgICBpZiAoWydub3J0aCcsICd3ZXN0JywgJ2Vhc3QnLCAnc291dGgnLCAnY2VudGVyJywgJ2NlbnRyZScsICdzb3V0aGVhc3QnLCAnc291dGh3ZXN0JywgJ25vcnRod2VzdCddLmluY2x1ZGVzKHBhcmFtKSkge1xuICAgICAgcmV0dXJuIHBhcmFtO1xuICAgIH0gZWxzZSBpZiAocGFyYW0gPT09ICdzZScpIHtcbiAgICAgIHJldHVybiAnc291dGhlYXN0JztcbiAgICB9IGVsc2UgaWYgKHBhcmFtID09PSAnc3cnKSB7XG4gICAgICByZXR1cm4gJ3NvdXRod2VzdCc7XG4gICAgfSBlbHNlIGlmIChwYXJhbSA9PT0gJ253Jykge1xuICAgICAgcmV0dXJuICdub3J0aHdlc3QnO1xuICAgIH0gZWxzZSBpZiAocGFyYW0gPT09ICduZScpIHtcbiAgICAgIHJldHVybiAnbm9ydGhlYXN0JztcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnV2F0ZXJtYXJrIHBhcmFtIFxcJ2dcXCcgbXVzdCBiZSBpbiBcXCdub3J0aFxcJywgXFwnd2VzdFxcJywgXFwnZWFzdFxcJywgXFwnc291dGhcXCcsIFxcJ2NlbnRlclxcJywgXFwnY2VudHJlXFwnLCBcXCdzb3V0aGVhc3RcXCcsIFxcJ3NvdXRod2VzdFxcJywgXFwnbm9ydGh3ZXN0XFwnJyk7XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgdGV4dEltZyhvcHQ6IFdhdGVybWFya09wdHMpOiBQcm9taXNlPHNoYXJwLlNoYXJwPiB7XG4gICAgY29uc3Qgc2FmZXRleHQgPSBlbmNvZGUob3B0LnRleHQpO1xuICAgIGNvbnN0IG8gPSBzaGFycCh7XG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IGA8c3BhbiBzaXplPVwiJHtvcHQuc2l6ZX1wdFwiIGZvcmVncm91bmQ9XCIjJHtvcHQuY29sb3J9XCI+JHtzYWZldGV4dH08L3NwYW4+YCxcbiAgICAgICAgYWxpZ246ICdjZW50ZXInLFxuICAgICAgICByZ2JhOiB0cnVlLFxuICAgICAgICBkcGk6IDcyLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBpZiAob3B0LnNoYWRvdyA9PT0gMCkge1xuICAgICAgcmV0dXJuIG87XG4gICAgfVxuXG4gICAgY29uc3QgbWV0YSA9IGF3YWl0IG8ubWV0YWRhdGEoKTtcbiAgICBjb25zdCBvZmZzZXQgPSAyO1xuICAgIGxldCBleHBlY3RlZFdpZHRoID0gb2Zmc2V0O1xuICAgIGxldCBleHBlY3RlZEhlaWdodCA9IG9mZnNldDtcbiAgICBpZiAobWV0YS53aWR0aCAmJiBtZXRhLmhlaWdodCkge1xuICAgICAgZXhwZWN0ZWRXaWR0aCArPSBtZXRhLndpZHRoO1xuICAgICAgZXhwZWN0ZWRIZWlnaHQgKz0gbWV0YS5oZWlnaHQ7XG4gICAgfVxuXG5cbiAgICBjb25zdCBzaGFkb3cgPSBzaGFycCh7XG4gICAgICB0ZXh0OiB7XG4gICAgICAgIHRleHQ6IGA8c3BhbiBzaXplPVwiJHtvcHQuc2l6ZX1wdFwiIGZvcmVncm91bmQ9XCIjJHtvcHQuaGFsb31cIj4ke3NhZmV0ZXh0fTwvc3Bhbj5gLFxuICAgICAgICBhbGlnbjogJ2NlbnRlcicsXG4gICAgICAgIHJnYmE6IHRydWUsXG4gICAgICAgIGRwaTogNzIsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgY29uc3Qgb0J1ZmZlciA9IGF3YWl0IG8ucG5nKCkudG9CdWZmZXIoKTtcbiAgICBjb25zdCBvcGFjaXR5ID0gb3B0LnNoYWRvdyAvIDEwMDtcbiAgICBjb25zdCBjb3B5ID0gYXdhaXQgc2hhZG93LnBuZygpLmVuc3VyZUFscGhhKG9wYWNpdHkpLnRvQnVmZmVyKCk7XG5cbiAgICBjb25zdCB1ID0gYXdhaXQgc2hhcnAoe1xuICAgICAgY3JlYXRlOiB7XG4gICAgICAgIHdpZHRoOiBleHBlY3RlZFdpZHRoLFxuICAgICAgICBoZWlnaHQ6IGV4cGVjdGVkSGVpZ2h0LFxuICAgICAgICBjaGFubmVsczogNCxcbiAgICAgICAgYmFja2dyb3VuZDogeyByOiAwLCBnOiAwLCBiOiAwLCBhbHBoYTogMCB9LFxuICAgICAgfSxcbiAgICB9KS5jb21wb3NpdGUoW3sgaW5wdXQ6IGNvcHksIGxlZnQ6IG9mZnNldCwgdG9wOiBvZmZzZXQgfV0pLnBuZygpLnRvQnVmZmVyKCk7XG5cbiAgICBjb25zdCBidCA9IHNoYXJwKHUpLnBuZygpLmNvbXBvc2l0ZShbeyBpbnB1dDogb0J1ZmZlciwgZ3Jhdml0eTogJ25vcnRod2VzdCcgfV0pO1xuXG4gICAgcmV0dXJuIHNoYXJwKGF3YWl0IGJ0LnRvQnVmZmVyKCkpLnBuZygpO1xuICB9XG5cbiAgY2FsY3VsYXRlSW1nUG9zKG9wdDogV2F0ZXJtYXJrT3B0cywgbWV0YWRhdGE6IHNoYXJwLk1ldGFkYXRhLCBtYXJrTWV0YWRhdGE6IHNoYXJwLk1ldGFkYXRhKTogV2F0ZXJtYXJrUG9zT3B0cyB7XG4gICAgcmV0dXJuIHRoaXMuY2FsY3VsYXRlUG9zKG9wdCwgbWV0YWRhdGEud2lkdGgsIG1ldGFkYXRhLmhlaWdodCwgbWFya01ldGFkYXRhLndpZHRoLCBtYXJrTWV0YWRhdGEuaGVpZ2h0KTtcbiAgfVxuXG4gIGNhbGN1bGF0ZVBvcyhvcHQ6IFdhdGVybWFya09wdHMsIHNvdXJjZVc/OiBudW1iZXIsIHNvdXJjZUg/OiBudW1iZXIsIG1hcmtXPzogbnVtYmVyLCBtYXJrSD86IG51bWJlcik6IFdhdGVybWFya1Bvc09wdHMge1xuICAgIGxldCBpbWdYID0gdW5kZWZpbmVkO1xuICAgIGxldCBpbWdZID0gdW5kZWZpbmVkO1xuICAgIGlmIChtYXJrVyAmJiBzb3VyY2VXICYmIG1hcmtIICYmIHNvdXJjZUgpIHtcbiAgICAgIGlmIChbJ2Vhc3QnLCAnd2VzdCcsICdjZW50ZXInXS5pbmNsdWRlcyhvcHQuZykpIHtcbiAgICAgICAgaW1nWSA9IE1hdGgucm91bmQoKHNvdXJjZUggLSBtYXJrSCkgLyAyKSArIG9wdC52b2Zmc2V0O1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY2hlY2tZID0gb3B0LnkgPyBvcHQueSA6IDA7XG4gICAgICAgIGlmIChvcHQuZy5zdGFydHNXaXRoKCdzb3V0aCcpKSB7XG4gICAgICAgICAgaW1nWSA9IHNvdXJjZUggLSBtYXJrSCAtIGNoZWNrWTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBpbWdZID0gY2hlY2tZO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBpZiAoWydub3J0aCcsICdzb3V0aCddLmluY2x1ZGVzKG9wdC5nKSkge1xuICAgICAgICBpbWdYID0gTWF0aC5yb3VuZCgoc291cmNlVyAtIG1hcmtXKSAvIDIpO1xuICAgICAgICBpZiAoIWltZ1kpIHtcbiAgICAgICAgICBpZiAob3B0LmcgPT09ICdub3J0aCcpIHtcbiAgICAgICAgICAgIGltZ1kgPSAwO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbWdZID0gc291cmNlSCAtIG1hcmtIO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgY29uc3QgY2hlY2tYID0gb3B0LnggPyBvcHQueCA6IDA7XG4gICAgICAgIGlmIChvcHQuZy5lbmRzV2l0aCgnZWFzdCcpKSB7XG4gICAgICAgICAgaW1nWCA9IHNvdXJjZVcgLSBtYXJrVyAtIGNoZWNrWDtcbiAgICAgICAgfSBlbHNlIGlmIChvcHQuZyA9PT0gJ2NlbnRlcicpIHtcbiAgICAgICAgICBpbWdYID0gTWF0aC5yb3VuZCgoc291cmNlVyAtIG1hcmtXKSAvIDIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGltZ1ggPSBjaGVja1g7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIHg6IGltZ1gsXG4gICAgICB5OiBpbWdZLFxuICAgIH07XG4gIH1cblxuICBjYWxjdWxhdGVNaXhlZEdyYXZpdHkob3B0OiBXYXRlcm1hcmtPcHRzKTogV2F0ZXJtYXJrTWl4ZWRHcmF2aXR5T3B0cyB7XG4gICAgbGV0IGltZ0dyYXZpdHkgPSAnd2VzdCc7XG4gICAgbGV0IHR4dEdyYXZpdHkgPSAnZWFzdCc7XG4gICAgaWYgKG9wdC5vcmRlciA9PT0gMSkge1xuICAgICAgaWYgKG9wdC5hbGlnbiA9PT0gMSkge1xuICAgICAgICBpbWdHcmF2aXR5ID0gJ2Vhc3QnO1xuICAgICAgICB0eHRHcmF2aXR5ID0gJ3dlc3QnO1xuICAgICAgfSBlbHNlIGlmIChvcHQuYWxpZ24gPT09IDIpIHtcbiAgICAgICAgaW1nR3Jhdml0eSA9ICdzb3V0aGVhc3QnO1xuICAgICAgICB0eHRHcmF2aXR5ID0gJ3NvdXRod2VzdCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWdHcmF2aXR5ID0gJ25vcnRoZWFzdCc7XG4gICAgICAgIHR4dEdyYXZpdHkgPSAnbm9ydGh3ZXN0JztcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKG9wdC5hbGlnbiA9PT0gMSkge1xuICAgICAgICBpbWdHcmF2aXR5ID0gJ3dlc3QnO1xuICAgICAgICB0eHRHcmF2aXR5ID0gJ2Vhc3QnO1xuICAgICAgfSBlbHNlIGlmIChvcHQuYWxpZ24gPT09IDIpIHtcbiAgICAgICAgaW1nR3Jhdml0eSA9ICdzb3V0aHdlc3QnO1xuICAgICAgICB0eHRHcmF2aXR5ID0gJ3NvdXRoZWFzdCc7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBpbWdHcmF2aXR5ID0gJ25vcnRod2VzdCc7XG4gICAgICAgIHR4dEdyYXZpdHkgPSAnbm9ydGhlYXN0JztcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHtcbiAgICAgIGltZ0dyYXZpdHk6IGltZ0dyYXZpdHksXG4gICAgICB0ZXh0R3Jhdml0eTogdHh0R3Jhdml0eSxcbiAgICB9O1xuICB9XG5cbiAgYXN5bmMgYXV0b1Jlc2l6ZShjdHg6IElJbWFnZUNvbnRleHQsIG1hcms6IHNoYXJwLlNoYXJwLCBvcHQ6IFdhdGVybWFya09wdHMpOiBQcm9taXNlPHNoYXJwLlNoYXJwPiB7XG4gICAgbWFyayA9IHNoYXJwKGF3YWl0IG1hcmsucG5nKCkudG9CdWZmZXIoKSk7XG4gICAgY29uc3QgbW1ldGEgPSBhd2FpdCBtYXJrLm1ldGFkYXRhKCk7XG4gICAgY29uc3QgbWV0YWRhdGEgPSB3aXRoTm9ybWFsU2l6ZShjdHgubWV0YWRhdGEpO1xuICAgIGlmICghbW1ldGEud2lkdGggfHwgIW1ldGFkYXRhLndpZHRoIHx8ICFtbWV0YS5oZWlnaHQgfHwgIW1ldGFkYXRhLmhlaWdodCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdmYWlsZWQgdG8gZ2V0IHdpZHRoIG9yIGhlaWdodCBpbiBtZXRhZGF0YSEnKTtcbiAgICB9XG4gICAgaWYgKG9wdC5hdXRvKSB7XG4gICAgICAvLyByZW5ldyBhIHNoYXJwIG9iamVjdCwgb3RoZXJ3aXNlIHRoZSBtZXRhZGF0YSBpcyBub3QgcmlnaHQgYWZ0ZXIgcm90YXRlLCByZXNpemUgZXRjLlxuXG4gICAgICBsZXQgd3JhdGlvID0gMTtcbiAgICAgIGxldCBocmF0aW8gPSAxO1xuICAgICAgbGV0IG5lZWRSZXNpemUgPSBmYWxzZTtcblxuICAgICAgaWYgKG1tZXRhLndpZHRoID4gbWV0YWRhdGEud2lkdGgpIHtcbiAgICAgICAgd3JhdGlvID0gKG1ldGFkYXRhLndpZHRoIC0gNSkgLyBtbWV0YS53aWR0aDtcbiAgICAgICAgbmVlZFJlc2l6ZSA9IHRydWU7XG4gICAgICB9XG4gICAgICBpZiAobW1ldGEuaGVpZ2h0ID4gbWV0YWRhdGEuaGVpZ2h0KSB7XG4gICAgICAgIGhyYXRpbyA9IChtZXRhZGF0YS5oZWlnaHQgLSA1KSAvIG1tZXRhLmhlaWdodDtcbiAgICAgICAgbmVlZFJlc2l6ZSA9IHRydWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChuZWVkUmVzaXplICYmIG1tZXRhLmhlaWdodCAmJiBtbWV0YS53aWR0aCkge1xuICAgICAgICBjb25zdCBjaGFuZ2UgPSBNYXRoLm1pbih3cmF0aW8sIGhyYXRpbyk7XG4gICAgICAgIGNvbnN0IHcgPSBNYXRoLmZsb29yKG1tZXRhLndpZHRoICogY2hhbmdlKTtcbiAgICAgICAgY29uc3QgaCA9IE1hdGguZmxvb3IobW1ldGEuaGVpZ2h0ICogY2hhbmdlKTtcbiAgICAgICAgbWFyayA9IHNoYXJwKGF3YWl0IG1hcmsucmVzaXplKHcsIGgpLnBuZygpLnRvQnVmZmVyKCkpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBsZXQgbmVlZENyb3AgPSBmYWxzZTtcbiAgICAgIGxldCBsZWZ0ID0gMDtcbiAgICAgIGxldCB0b3AgPSAwO1xuXG4gICAgICBsZXQgd2lkdGggPSBtbWV0YS53aWR0aDtcbiAgICAgIGxldCBoZWlnaHQgPSBtbWV0YS5oZWlnaHQ7XG4gICAgICBjb25zdCBweCA9IG9wdC54ID8gb3B0LnggOiAwO1xuICAgICAgY29uc3QgcHkgPSBvcHQueSA/IG9wdC55IDogMDtcblxuICAgICAgaWYgKG1tZXRhLndpZHRoID4gbWV0YWRhdGEud2lkdGgpIHtcbiAgICAgICAgaWYgKG9wdC5nLmVuZHNXaXRoKCd3ZXN0JykpIHtcbiAgICAgICAgICBsZWZ0ID0gMDtcbiAgICAgICAgICB3aWR0aCA9IG1ldGFkYXRhLndpZHRoIC0gcHg7XG4gICAgICAgIH0gZWxzZSBpZiAob3B0LmcuZW5kc1dpdGgoJ2Vhc3QnKSkge1xuICAgICAgICAgIGxlZnQgPSBtbWV0YS53aWR0aCArIHB4IC0gbWV0YWRhdGEud2lkdGg7XG4gICAgICAgICAgd2lkdGggPSBtZXRhZGF0YS53aWR0aCAtIHB4O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIGxlZnQgPSBNYXRoLmZsb29yKChtbWV0YS53aWR0aCAtIG1ldGFkYXRhLndpZHRoKSAvIDIpO1xuICAgICAgICAgIHdpZHRoID0gbWV0YWRhdGEud2lkdGg7XG4gICAgICAgIH1cbiAgICAgICAgbmVlZENyb3AgPSB0cnVlO1xuICAgICAgfVxuICAgICAgLy8gJ25vcnRoJywgJ3NvdXRoJ1xuICAgICAgaWYgKG1tZXRhLmhlaWdodCA+IG1ldGFkYXRhLmhlaWdodCkge1xuICAgICAgICBpZiAob3B0Lmcuc3RhcnRzV2l0aCgnbm9ydGgnKSkge1xuICAgICAgICAgIHRvcCA9IDA7XG4gICAgICAgICAgaGVpZ2h0ID0gbWV0YWRhdGEuaGVpZ2h0IC0gcHk7XG4gICAgICAgIH0gZWxzZSBpZiAob3B0Lmcuc3RhcnRzV2l0aCgnc291dGgnKSkge1xuICAgICAgICAgIHRvcCA9IG1tZXRhLmhlaWdodCArIHB5IC0gbWV0YWRhdGEuaGVpZ2h0O1xuICAgICAgICAgIGhlaWdodCA9IG1ldGFkYXRhLmhlaWdodCAtIHB5O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRvcCA9IE1hdGguZmxvb3IoKG1tZXRhLmhlaWdodCAtIG1ldGFkYXRhLmhlaWdodCkgLyAyKTtcbiAgICAgICAgICBoZWlnaHQgPSBtZXRhZGF0YS5oZWlnaHQ7XG4gICAgICAgIH1cbiAgICAgICAgbmVlZENyb3AgPSB0cnVlO1xuICAgICAgfVxuICAgICAgaWYgKG5lZWRDcm9wKSB7XG4gICAgICAgIG1hcmsgPSBzaGFycChhd2FpdCBtYXJrLmV4dHJhY3QoeyBsZWZ0OiBsZWZ0LCB0b3A6IHRvcCwgd2lkdGg6IHdpZHRoLCBoZWlnaHQ6IGhlaWdodCB9KS5wbmcoKS50b0J1ZmZlcigpKTtcbiAgICAgIH1cblxuICAgIH1cbiAgICByZXR1cm4gbWFyaztcbiAgfVxuXG4gIGFzeW5jIGV4dHJhSW1nT3ZlcmxheShtYXJrSW1nOiBzaGFycC5TaGFycCwgb3B0OiBXYXRlcm1hcmtPcHRzLCBwb3M/OiBXYXRlcm1hcmtQb3NPcHRzKTogUHJvbWlzZTxzaGFycC5PdmVybGF5T3B0aW9ucz4ge1xuXG4gICAgaWYgKG9wdC50IDwgMTAwKSB7XG4gICAgICBtYXJrSW1nID0gbWFya0ltZy5jb252b2x2ZSh7XG4gICAgICAgIHdpZHRoOiAzLFxuICAgICAgICBoZWlnaHQ6IDMsXG4gICAgICAgIGtlcm5lbDogW1xuICAgICAgICAgIDAsIDAsIDAsXG4gICAgICAgICAgMCwgb3B0LnQgLyAxMDAsIDAsXG4gICAgICAgICAgMCwgMCwgMCxcbiAgICAgICAgXSxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBidCA9IGF3YWl0IG1hcmtJbWcucG5nKCkudG9CdWZmZXIoKTtcbiAgICBjb25zdCBvdmVybGF5OiBzaGFycC5PdmVybGF5T3B0aW9ucyA9IHsgaW5wdXQ6IGJ0LCB0aWxlOiBvcHQuZmlsbCwgZ3Jhdml0eTogb3B0LmcgfTtcblxuICAgIGlmIChwb3MpIHtcbiAgICAgIG92ZXJsYXkudG9wID0gcG9zLnk7XG4gICAgICBvdmVybGF5LmxlZnQgPSBwb3MueDtcbiAgICB9XG5cblxuICAgIHJldHVybiBvdmVybGF5O1xuICB9XG59XG5cbmZ1bmN0aW9uIHdpdGhOb3JtYWxTaXplKG1ldGFkYXRhOiBzaGFycC5NZXRhZGF0YSk6IHNoYXJwLk1ldGFkYXRhIHtcbiAgY29uc3QgbyA9IE9iamVjdC5hc3NpZ24oe30sIG1ldGFkYXRhKTtcbiAgaWYgKChtZXRhZGF0YS5vcmllbnRhdGlvbiB8fCAwKSA+PSA1KSB7XG4gICAgW28ud2lkdGgsIG8uaGVpZ2h0XSA9IFtvLmhlaWdodCwgby53aWR0aF07XG4gIH1cbiAgcmV0dXJuIG87XG59XG4iXX0=