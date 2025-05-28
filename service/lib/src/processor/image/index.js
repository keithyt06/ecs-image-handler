"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ImageProcessor = void 0;
const sharp = require("sharp");
const processor_1 = require("../../processor");
const _base_1 = require("./_base");
const auto_orient_1 = require("./auto-orient");
const blur_1 = require("./blur");
const bright_1 = require("./bright");
const cgif_1 = require("./cgif");
const circle_1 = require("./circle");
const contrast_1 = require("./contrast");
const crop_1 = require("./crop");
const format_1 = require("./format");
const grey_1 = require("./grey");
const indexcrop_1 = require("./indexcrop");
const info_1 = require("./info");
const interlace_1 = require("./interlace");
const quality_1 = require("./quality");
const resize_1 = require("./resize");
const rotate_1 = require("./rotate");
const rounded_corners_1 = require("./rounded-corners");
const sharpen_1 = require("./sharpen");
const strip_metadata_1 = require("./strip-metadata");
const threshold_1 = require("./threshold");
const watermark_1 = require("./watermark");
const MB = 1024 * 1024;
class ImageProcessor {
    static getInstance() {
        if (!ImageProcessor._instance) {
            ImageProcessor._instance = new ImageProcessor();
        }
        return ImageProcessor._instance;
    }
    constructor() {
        this._actions = {};
        this._maxGifSizeMB = 5;
        this._maxGifPages = 100;
        this.name = 'image';
    }
    setMaxGifSizeMB(value) {
        if (value > 0) {
            this._maxGifSizeMB = value;
        }
        else {
            console.warn(`Max gif size must > 0, but the value is ${value}`);
        }
    }
    setMaxGifPages(value) {
        if (value > 0) {
            this._maxGifPages = value;
        }
        else {
            console.warn(`Max gif pages must > 0, but the value is ${value}`);
        }
    }
    async newContext(uri, actions, bufferStore) {
        const ctx = {
            uri,
            actions,
            mask: new _base_1.ActionMask(actions),
            bufferStore,
            features: {
                [processor_1.Features.AutoOrient]: true,
                [processor_1.Features.ReadAllAnimatedFrames]: true,
            },
            headers: {},
        };
        for (let i = 0; i < actions.length; i++) {
            const action = actions[i];
            if ((this.name === action) || (!action)) {
                continue;
            }
            // "<action-name>,<param-1>,<param-2>,..."
            const params = action.split(',');
            const name = params[0];
            const act = this.action(name);
            if (!act) {
                throw new processor_1.InvalidArgument(`Unkown action: "${name}"`);
            }
            act.beforeNewContext.bind(act)(ctx, params, i);
        }
        const { buffer, headers } = await bufferStore.get(uri);
        let image;
        let metadata;
        if (ctx.features[processor_1.Features.LimitAnimatedFrames] > 0) {
            image = sharp(buffer, { failOnError: false, animated: false });
            metadata = await image.metadata();
            if (!('gif' === metadata.format)) {
                throw new processor_1.InvalidArgument('Format must be Gif');
            }
            if (!(metadata.pages)) {
                throw new processor_1.InvalidArgument('Can\'t read gif\'s pages');
            }
            const pages = Math.min(ctx.features[processor_1.Features.LimitAnimatedFrames], metadata.pages);
            image = sharp(buffer, { failOnError: false, animated: ctx.features[processor_1.Features.ReadAllAnimatedFrames], pages });
            metadata = await image.metadata();
        }
        else {
            image = sharp(buffer, { failOnError: false, animated: ctx.features[processor_1.Features.ReadAllAnimatedFrames] });
            metadata = await image.metadata();
        }
        if ('gif' === metadata.format) {
            image.gif({ effort: 1 }); // https://github.com/lovell/sharp/issues/3176
            if (metadata.size && metadata.size > (this._maxGifSizeMB * MB)) {
                console.log(`Gif processing skipped. The image size exceeds ${this._maxGifSizeMB} MB`);
                ctx.mask.disableAll();
            }
            else if (metadata.pages && metadata.pages > this._maxGifPages) {
                console.log(`Gif processing skipped. The image pages exceeds ${this._maxGifPages}`);
                ctx.mask.disableAll();
            }
        }
        if ('png' === metadata.format && metadata.size && metadata.size > (5 * MB)) {
            image.png({ adaptiveFiltering: true });
        }
        return {
            uri: ctx.uri,
            actions: ctx.actions,
            mask: ctx.mask,
            bufferStore: ctx.bufferStore,
            features: ctx.features,
            headers: Object.assign(ctx.headers, headers),
            metadata,
            image,
        };
    }
    async process(ctx) {
        if (!ctx.image) {
            throw new processor_1.InvalidArgument('Invalid image context! No "image" field.');
        }
        if (!ctx.actions) {
            throw new processor_1.InvalidArgument('Invalid image context! No "actions" field.');
        }
        if (ctx.features[processor_1.Features.AutoOrient]) {
            ctx.image.rotate();
        }
        ctx.mask.forEachAction((action, _, index) => {
            if ((this.name === action) || (!action)) {
                return;
            }
            // "<action-name>,<param-1>,<param-2>,..."
            const params = action.split(',');
            const name = params[0];
            const act = this.action(name);
            if (!act) {
                throw new processor_1.InvalidArgument(`Unkown action: "${name}"`);
            }
            act.beforeProcess.bind(act)(ctx, params, index);
        });
        const enabledActions = ctx.mask.filterEnabledActions();
        const nothing2do = (enabledActions.length === 0) || ((enabledActions.length === 1) && (this.name === enabledActions[0]));
        if (nothing2do && (!ctx.features[processor_1.Features.AutoWebp])) {
            const { buffer } = await ctx.bufferStore.get(ctx.uri);
            return { data: buffer, type: ctx.metadata.format };
        }
        for (const action of enabledActions) {
            if ((this.name === action) || (!action)) {
                continue;
            }
            // "<action-name>,<param-1>,<param-2>,..."
            const params = action.split(',');
            const name = params[0];
            const act = this.action(name);
            if (!act) {
                throw new processor_1.InvalidArgument(`Unkown action: "${name}"`);
            }
            await act.process(ctx, params);
            if (ctx.features[processor_1.Features.ReturnInfo]) {
                break;
            }
        }
        if (ctx.features[processor_1.Features.AutoWebp]) {
            ctx.image.webp();
        }
        if (ctx.features[processor_1.Features.AutoAvif]) {
            ctx.image.avif({ effort: 2, quality: 60 });
        }
        if (ctx.features[processor_1.Features.ReturnInfo]) {
            return { data: ctx.info, type: 'application/json' };
        }
        else {
            const { data, info } = await ctx.image.toBuffer({ resolveWithObject: true });
            // 处理特殊的 MIME 类型
            let mimeType = 'image/' + info.format;
            if (info.format === 'heif' && ctx.metadata.format === 'avif') {
                mimeType = 'image/avif';
            }
            return { data: data, type: mimeType };
        }
    }
    action(name) {
        return this._actions[name];
    }
    register(...actions) {
        for (const action of actions) {
            if (!this._actions[action.name]) {
                this._actions[action.name] = action;
            }
        }
    }
}
exports.ImageProcessor = ImageProcessor;
// Register actions
ImageProcessor.getInstance().register(new resize_1.ResizeAction(), new quality_1.QualityAction(), new bright_1.BrightAction(), new format_1.FormatAction(), new blur_1.BlurAction(), new rotate_1.RotateAction(), new contrast_1.ContrastAction(), new sharpen_1.SharpenAction(), new interlace_1.InterlaceAction(), new auto_orient_1.AutoOrientAction(), new grey_1.GreyAction(), new crop_1.CropAction(), new circle_1.CircleAction(), new indexcrop_1.IndexCropAction(), new rounded_corners_1.RoundedCornersAction(), new watermark_1.WatermarkAction(), new info_1.InfoAction(), new cgif_1.CgifAction(), new strip_metadata_1.StripMetadataAction(), new threshold_1.ThresholdAction());
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvY2Vzc29yL2ltYWdlL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLCtCQUErQjtBQUMvQiwrQ0FBb0g7QUFFcEgsbUNBQXFDO0FBQ3JDLCtDQUFpRDtBQUNqRCxpQ0FBb0M7QUFDcEMscUNBQXdDO0FBQ3hDLGlDQUFvQztBQUNwQyxxQ0FBd0M7QUFDeEMseUNBQTRDO0FBQzVDLGlDQUFvQztBQUNwQyxxQ0FBd0M7QUFDeEMsaUNBQW9DO0FBQ3BDLDJDQUE4QztBQUM5QyxpQ0FBb0M7QUFDcEMsMkNBQThDO0FBQzlDLHVDQUEwQztBQUMxQyxxQ0FBd0M7QUFDeEMscUNBQXdDO0FBQ3hDLHVEQUF5RDtBQUN6RCx1Q0FBMEM7QUFDMUMscURBQXVEO0FBQ3ZELDJDQUE4QztBQUM5QywyQ0FBOEM7QUFXOUMsTUFBTSxFQUFFLEdBQUcsSUFBSSxHQUFHLElBQUksQ0FBQztBQUV2QixNQUFhLGNBQWM7SUFDbEIsTUFBTSxDQUFDLFdBQVc7UUFDdkIsSUFBSSxDQUFDLGNBQWMsQ0FBQyxTQUFTLEVBQUU7WUFDN0IsY0FBYyxDQUFDLFNBQVMsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1NBQ2pEO1FBQ0QsT0FBTyxjQUFjLENBQUMsU0FBUyxDQUFDO0lBQ2xDLENBQUM7SUFRRDtRQU5pQixhQUFRLEdBQWdDLEVBQUUsQ0FBQztRQUNwRCxrQkFBYSxHQUFXLENBQUMsQ0FBQztRQUMxQixpQkFBWSxHQUFXLEdBQUcsQ0FBQztRQUVuQixTQUFJLEdBQVcsT0FBTyxDQUFDO0lBRWYsQ0FBQztJQUVsQixlQUFlLENBQUMsS0FBYTtRQUNsQyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUU7WUFDYixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQztTQUM1QjthQUFNO1lBQ0wsT0FBTyxDQUFDLElBQUksQ0FBQywyQ0FBMkMsS0FBSyxFQUFFLENBQUMs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LEVBQUUsRUFDckIsSUFBSSxpQkFBVSxFQUFFLEVBQ2hCLElBQUksaUJBQVUsRUFBRSxFQUNoQixJQUFJLG9DQUFtQixFQUFFLEVBQ3pCLElBQUksMkJBQWUsRUFBRSxDQUN0QixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgc2hhcnAgZnJvbSAnc2hhcnAnO1xuaW1wb3J0IHsgRmVhdHVyZXMsIElBY3Rpb24sIEludmFsaWRBcmd1bWVudCwgSVByb2Nlc3NDb250ZXh0LCBJUHJvY2Vzc29yLCBJUHJvY2Vzc1Jlc3BvbnNlIH0gZnJvbSAnLi4vLi4vcHJvY2Vzc29yJztcbmltcG9ydCB7IElCdWZmZXJTdG9yZSB9IGZyb20gJy4uLy4uL3N0b3JlJztcbmltcG9ydCB7IEFjdGlvbk1hc2sgfSBmcm9tICcuL19iYXNlJztcbmltcG9ydCB7IEF1dG9PcmllbnRBY3Rpb24gfSBmcm9tICcuL2F1dG8tb3JpZW50JztcbmltcG9ydCB7IEJsdXJBY3Rpb24gfSBmcm9tICcuL2JsdXInO1xuaW1wb3J0IHsgQnJpZ2h0QWN0aW9uIH0gZnJvbSAnLi9icmlnaHQnO1xuaW1wb3J0IHsgQ2dpZkFjdGlvbiB9IGZyb20gJy4vY2dpZic7XG5pbXBvcnQgeyBDaXJjbGVBY3Rpb24gfSBmcm9tICcuL2NpcmNsZSc7XG5pbXBvcnQgeyBDb250cmFzdEFjdGlvbiB9IGZyb20gJy4vY29udHJhc3QnO1xuaW1wb3J0IHsgQ3JvcEFjdGlvbiB9IGZyb20gJy4vY3JvcCc7XG5pbXBvcnQgeyBGb3JtYXRBY3Rpb24gfSBmcm9tICcuL2Zvcm1hdCc7XG5pbXBvcnQgeyBHcmV5QWN0aW9uIH0gZnJvbSAnLi9ncmV5JztcbmltcG9ydCB7IEluZGV4Q3JvcEFjdGlvbiB9IGZyb20gJy4vaW5kZXhjcm9wJztcbmltcG9ydCB7IEluZm9BY3Rpb24gfSBmcm9tICcuL2luZm8nO1xuaW1wb3J0IHsgSW50ZXJsYWNlQWN0aW9uIH0gZnJvbSAnLi9pbnRlcmxhY2UnO1xuaW1wb3J0IHsgUXVhbGl0eUFjdGlvbiB9IGZyb20gJy4vcXVhbGl0eSc7XG5pbXBvcnQgeyBSZXNpemVBY3Rpb24gfSBmcm9tICcuL3Jlc2l6ZSc7XG5pbXBvcnQgeyBSb3RhdGVBY3Rpb24gfSBmcm9tICcuL3JvdGF0ZSc7XG5pbXBvcnQgeyBSb3VuZGVkQ29ybmVyc0FjdGlvbiB9IGZyb20gJy4vcm91bmRlZC1jb3JuZXJzJztcbmltcG9ydCB7IFNoYXJwZW5BY3Rpb24gfSBmcm9tICcuL3NoYXJwZW4nO1xuaW1wb3J0IHsgU3RyaXBNZXRhZGF0YUFjdGlvbiB9IGZyb20gJy4vc3RyaXAtbWV0YWRhdGEnO1xuaW1wb3J0IHsgVGhyZXNob2xkQWN0aW9uIH0gZnJvbSAnLi90aHJlc2hvbGQnO1xuaW1wb3J0IHsgV2F0ZXJtYXJrQWN0aW9uIH0gZnJvbSAnLi93YXRlcm1hcmsnO1xuXG5leHBvcnQgaW50ZXJmYWNlIElJbWFnZUluZm8ge1xuICBba2V5OiBzdHJpbmddOiB7IHZhbHVlOiBzdHJpbmcgfTtcbn1cbmV4cG9ydCBpbnRlcmZhY2UgSUltYWdlQ29udGV4dCBleHRlbmRzIElQcm9jZXNzQ29udGV4dCB7XG4gIGltYWdlOiBzaGFycC5TaGFycDtcbiAgbWV0YWRhdGE6IHNoYXJwLk1ldGFkYXRhO1xuICBpbmZvPzogSUltYWdlSW5mbztcbn1cblxuY29uc3QgTUIgPSAxMDI0ICogMTAyNDtcblxuZXhwb3J0IGNsYXNzIEltYWdlUHJvY2Vzc29yIGltcGxlbWVudHMgSVByb2Nlc3NvciB7XG4gIHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2UoKTogSW1hZ2VQcm9jZXNzb3Ige1xuICAgIGlmICghSW1hZ2VQcm9jZXNzb3IuX2luc3RhbmNlKSB7XG4gICAgICBJbWFnZVByb2Nlc3Nvci5faW5zdGFuY2UgPSBuZXcgSW1hZ2VQcm9jZXNzb3IoKTtcbiAgICB9XG4gICAgcmV0dXJuIEltYWdlUHJvY2Vzc29yLl9pbnN0YW5jZTtcbiAgfVxuICBwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2U6IEltYWdlUHJvY2Vzc29yO1xuICBwcml2YXRlIHJlYWRvbmx5IF9hY3Rpb25zOiB7IFtuYW1lOiBzdHJpbmddOiBJQWN0aW9uIH0gPSB7fTtcbiAgcHJpdmF0ZSBfbWF4R2lmU2l6ZU1COiBudW1iZXIgPSA1O1xuICBwcml2YXRlIF9tYXhHaWZQYWdlczogbnVtYmVyID0gMTAwO1xuXG4gIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcgPSAnaW1hZ2UnO1xuXG4gIHByaXZhdGUgY29uc3RydWN0b3IoKSB7IH1cblxuICBwdWJsaWMgc2V0TWF4R2lmU2l6ZU1CKHZhbHVlOiBudW1iZXIpIHtcbiAgICBpZiAodmFsdWUgPiAwKSB7XG4gICAgICB0aGlzLl9tYXhHaWZTaXplTUIgPSB2YWx1ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc29sZS53YXJuKGBNYXggZ2lmIHNpemUgbXVzdCA+IDAsIGJ1dCB0aGUgdmFsdWUgaXMgJHt2YWx1ZX1gKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgc2V0TWF4R2lmUGFnZXModmFsdWU6IG51bWJlcikge1xuICAgIGlmICh2YWx1ZSA+IDApIHtcbiAgICAgIHRoaXMuX21heEdpZlBhZ2VzID0gdmFsdWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnNvbGUud2FybihgTWF4IGdpZiBwYWdlcyBtdXN0ID4gMCwgYnV0IHRoZSB2YWx1ZSBpcyAke3ZhbHVlfWApO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBuZXdDb250ZXh0KHVyaTogc3RyaW5nLCBhY3Rpb25zOiBzdHJpbmdbXSwgYnVmZmVyU3RvcmU6IElCdWZmZXJTdG9yZSk6IFByb21pc2U8SUltYWdlQ29udGV4dD4ge1xuICAgIGNvbnN0IGN0eDogSVByb2Nlc3NDb250ZXh0ID0ge1xuICAgICAgdXJpLFxuICAgICAgYWN0aW9ucyxcbiAgICAgIG1hc2s6IG5ldyBBY3Rpb25NYXNrKGFjdGlvbnMpLFxuICAgICAgYnVmZmVyU3RvcmUsXG4gICAgICBmZWF0dXJlczoge1xuICAgICAgICBbRmVhdHVyZXMuQXV0b09yaWVudF06IHRydWUsXG4gICAgICAgIFtGZWF0dXJlcy5SZWFkQWxsQW5pbWF0ZWRGcmFtZXNdOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIGhlYWRlcnM6IHt9LFxuICAgIH07XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBhY3Rpb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICBjb25zdCBhY3Rpb24gPSBhY3Rpb25zW2ldO1xuICAgICAgaWYgKCh0aGlzLm5hbWUgPT09IGFjdGlvbikgfHwgKCFhY3Rpb24pKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgLy8gXCI8YWN0aW9uLW5hbWU+LDxwYXJhbS0xPiw8cGFyYW0tMj4sLi4uXCJcbiAgICAgIGNvbnN0IHBhcmFtcyA9IGFjdGlvbi5zcGxpdCgnLCcpO1xuICAgICAgY29uc3QgbmFtZSA9IHBhcmFtc1swXTtcbiAgICAgIGNvbnN0IGFjdCA9IHRoaXMuYWN0aW9uKG5hbWUpO1xuICAgICAgaWYgKCFhY3QpIHtcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgVW5rb3duIGFjdGlvbjogXCIke25hbWV9XCJgKTtcbiAgICAgIH1cbiAgICAgIGFjdC5iZWZvcmVOZXdDb250ZXh0LmJpbmQoYWN0KShjdHgsIHBhcmFtcywgaSk7XG4gICAgfVxuICAgIGNvbnN0IHsgYnVmZmVyLCBoZWFkZXJzIH0gPSBhd2FpdCBidWZmZXJTdG9yZS5nZXQodXJpKTtcbiAgICBsZXQgaW1hZ2U7XG4gICAgbGV0IG1ldGFkYXRhO1xuICAgIGlmIChjdHguZmVhdHVyZXNbRmVhdHVyZXMuTGltaXRBbmltYXRlZEZyYW1lc10gPiAwKSB7XG4gICAgICBpbWFnZSA9IHNoYXJwKGJ1ZmZlciwgeyBmYWlsT25FcnJvcjogZmFsc2UsIGFuaW1hdGVkOiBmYWxzZSB9KTtcbiAgICAgIG1ldGFkYXRhID0gYXdhaXQgaW1hZ2UubWV0YWRhdGEoKTtcbiAgICAgIGlmICghKCdnaWYnID09PSBtZXRhZGF0YS5mb3JtYXQpKSB7XG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0Zvcm1hdCBtdXN0IGJlIEdpZicpO1xuICAgICAgfVxuICAgICAgaWYgKCEobWV0YWRhdGEucGFnZXMpKSB7XG4gICAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0NhblxcJ3QgcmVhZCBnaWZcXCdzIHBhZ2VzJyk7XG4gICAgICB9XG4gICAgICBjb25zdCBwYWdlcyA9IE1hdGgubWluKGN0eC5mZWF0dXJlc1tGZWF0dXJlcy5MaW1pdEFuaW1hdGVkRnJhbWVzXSwgbWV0YWRhdGEucGFnZXMpO1xuICAgICAgaW1hZ2UgPSBzaGFycChidWZmZXIsIHsgZmFpbE9uRXJyb3I6IGZhbHNlLCBhbmltYXRlZDogY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLlJlYWRBbGxBbmltYXRlZEZyYW1lc10sIHBhZ2VzIH0pO1xuICAgICAgbWV0YWRhdGEgPSBhd2FpdCBpbWFnZS5tZXRhZGF0YSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBpbWFnZSA9IHNoYXJwKGJ1ZmZlciwgeyBmYWlsT25FcnJvcjogZmFsc2UsIGFuaW1hdGVkOiBjdHguZmVhdHVyZXNbRmVhdHVyZXMuUmVhZEFsbEFuaW1hdGVkRnJhbWVzXSB9KTtcbiAgICAgIG1ldGFkYXRhID0gYXdhaXQgaW1hZ2UubWV0YWRhdGEoKTtcbiAgICB9XG4gICAgaWYgKCdnaWYnID09PSBtZXRhZGF0YS5mb3JtYXQpIHtcbiAgICAgIGltYWdlLmdpZih7IGVmZm9ydDogMSB9KTsgLy8gaHR0cHM6Ly9naXRodWIuY29tL2xvdmVsbC9zaGFycC9pc3N1ZXMvMzE3NlxuXG4gICAgICBpZiAobWV0YWRhdGEuc2l6ZSAmJiBtZXRhZGF0YS5zaXplID4gKHRoaXMuX21heEdpZlNpemVNQiAqIE1CKSkge1xuICAgICAgICBjb25zb2xlLmxvZyhgR2lmIHByb2Nlc3Npbmcgc2tpcHBlZC4gVGhlIGltYWdlIHNpemUgZXhjZWVkcyAke3RoaXMuX21heEdpZlNpemVNQn0gTUJgKTtcbiAgICAgICAgY3R4Lm1hc2suZGlzYWJsZUFsbCgpO1xuICAgICAgfSBlbHNlIGlmIChtZXRhZGF0YS5wYWdlcyAmJiBtZXRhZGF0YS5wYWdlcyA+IHRoaXMuX21heEdpZlBhZ2VzKSB7XG4gICAgICAgIGNvbnNvbGUubG9nKGBHaWYgcHJvY2Vzc2luZyBza2lwcGVkLiBUaGUgaW1hZ2UgcGFnZXMgZXhjZWVkcyAke3RoaXMuX21heEdpZlBhZ2VzfWApO1xuICAgICAgICBjdHgubWFzay5kaXNhYmxlQWxsKCk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmICgncG5nJyA9PT0gbWV0YWRhdGEuZm9ybWF0ICYmIG1ldGFkYXRhLnNpemUgJiYgbWV0YWRhdGEuc2l6ZSA+ICg1ICogTUIpKSB7XG4gICAgICBpbWFnZS5wbmcoeyBhZGFwdGl2ZUZpbHRlcmluZzogdHJ1ZSB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgdXJpOiBjdHgudXJpLFxuICAgICAgYWN0aW9uczogY3R4LmFjdGlvbnMsXG4gICAgICBtYXNrOiBjdHgubWFzayxcbiAgICAgIGJ1ZmZlclN0b3JlOiBjdHguYnVmZmVyU3RvcmUsXG4gICAgICBmZWF0dXJlczogY3R4LmZlYXR1cmVzLFxuICAgICAgaGVhZGVyczogT2JqZWN0LmFzc2lnbihjdHguaGVhZGVycywgaGVhZGVycyksXG4gICAgICBtZXRhZGF0YSxcbiAgICAgIGltYWdlLFxuICAgIH07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJvY2VzcyhjdHg6IElJbWFnZUNvbnRleHQpOiBQcm9taXNlPElQcm9jZXNzUmVzcG9uc2U+IHtcbiAgICBpZiAoIWN0eC5pbWFnZSkge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnSW52YWxpZCBpbWFnZSBjb250ZXh0ISBObyBcImltYWdlXCIgZmllbGQuJyk7XG4gICAgfVxuICAgIGlmICghY3R4LmFjdGlvbnMpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0ludmFsaWQgaW1hZ2UgY29udGV4dCEgTm8gXCJhY3Rpb25zXCIgZmllbGQuJyk7XG4gICAgfVxuXG4gICAgaWYgKGN0eC5mZWF0dXJlc1tGZWF0dXJlcy5BdXRvT3JpZW50XSkgeyBjdHguaW1hZ2Uucm90YXRlKCk7IH1cblxuICAgIGN0eC5tYXNrLmZvckVhY2hBY3Rpb24oKGFjdGlvbiwgXywgaW5kZXgpID0+IHtcbiAgICAgIGlmICgodGhpcy5uYW1lID09PSBhY3Rpb24pIHx8ICghYWN0aW9uKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICAvLyBcIjxhY3Rpb24tbmFtZT4sPHBhcmFtLTE+LDxwYXJhbS0yPiwuLi5cIlxuICAgICAgY29uc3QgcGFyYW1zID0gYWN0aW9uLnNwbGl0KCcsJyk7XG4gICAgICBjb25zdCBuYW1lID0gcGFyYW1zWzBdO1xuICAgICAgY29uc3QgYWN0ID0gdGhpcy5hY3Rpb24obmFtZSk7XG4gICAgICBpZiAoIWFjdCkge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gYWN0aW9uOiBcIiR7bmFtZX1cImApO1xuICAgICAgfVxuICAgICAgYWN0LmJlZm9yZVByb2Nlc3MuYmluZChhY3QpKGN0eCwgcGFyYW1zLCBpbmRleCk7XG4gICAgfSk7XG4gICAgY29uc3QgZW5hYmxlZEFjdGlvbnMgPSBjdHgubWFzay5maWx0ZXJFbmFibGVkQWN0aW9ucygpO1xuICAgIGNvbnN0IG5vdGhpbmcyZG8gPSAoZW5hYmxlZEFjdGlvbnMubGVuZ3RoID09PSAwKSB8fCAoKGVuYWJsZWRBY3Rpb25zLmxlbmd0aCA9PT0gMSkgJiYgKHRoaXMubmFtZSA9PT0gZW5hYmxlZEFjdGlvbnNbMF0pKTtcblxuICAgIGlmIChub3RoaW5nMmRvICYmICghY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLkF1dG9XZWJwXSkpIHtcbiAgICAgIGNvbnN0IHsgYnVmZmVyIH0gPSBhd2FpdCBjdHguYnVmZmVyU3RvcmUuZ2V0KGN0eC51cmkpO1xuICAgICAgcmV0dXJuIHsgZGF0YTogYnVmZmVyLCB0eXBlOiBjdHgubWV0YWRhdGEuZm9ybWF0ISB9O1xuICAgIH1cblxuICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGVuYWJsZWRBY3Rpb25zKSB7XG4gICAgICBpZiAoKHRoaXMubmFtZSA9PT0gYWN0aW9uKSB8fCAoIWFjdGlvbikpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICAvLyBcIjxhY3Rpb24tbmFtZT4sPHBhcmFtLTE+LDxwYXJhbS0yPiwuLi5cIlxuICAgICAgY29uc3QgcGFyYW1zID0gYWN0aW9uLnNwbGl0KCcsJyk7XG4gICAgICBjb25zdCBuYW1lID0gcGFyYW1zWzBdO1xuICAgICAgY29uc3QgYWN0ID0gdGhpcy5hY3Rpb24obmFtZSk7XG4gICAgICBpZiAoIWFjdCkge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gYWN0aW9uOiBcIiR7bmFtZX1cImApO1xuICAgICAgfVxuICAgICAgYXdhaXQgYWN0LnByb2Nlc3MoY3R4LCBwYXJhbXMpO1xuXG4gICAgICBpZiAoY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLlJldHVybkluZm9dKSB7IGJyZWFrOyB9XG4gICAgfVxuICAgIGlmIChjdHguZmVhdHVyZXNbRmVhdHVyZXMuQXV0b1dlYnBdKSB7IGN0eC5pbWFnZS53ZWJwKCk7IH1cbiAgICBpZiAoY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLkF1dG9BdmlmXSkgeyBjdHguaW1hZ2UuYXZpZih7IGVmZm9ydDogMiwgcXVhbGl0eTogNjAgfSk7IH1cbiAgICBpZiAoY3R4LmZlYXR1cmVzW0ZlYXR1cmVzLlJldHVybkluZm9dKSB7XG4gICAgICByZXR1cm4geyBkYXRhOiBjdHguaW5mbywgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH07XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHsgZGF0YSwgaW5mbyB9ID0gYXdhaXQgY3R4LmltYWdlLnRvQnVmZmVyKHsgcmVzb2x2ZVdpdGhPYmplY3Q6IHRydWUgfSk7XG4gICAgICAvLyDlpITnkIbnibnmrornmoQgTUlNRSDnsbvlnotcbiAgICAgIGxldCBtaW1lVHlwZSA9ICdpbWFnZS8nICsgaW5mby5mb3JtYXQ7XG4gICAgICBpZiAoaW5mby5mb3JtYXQgPT09ICdoZWlmJyAmJiBjdHgubWV0YWRhdGEuZm9ybWF0ID09PSAnYXZpZicpIHtcbiAgICAgICAgbWltZVR5cGUgPSAnaW1hZ2UvYXZpZic7XG4gICAgICB9XG4gICAgICByZXR1cm4geyBkYXRhOiBkYXRhLCB0eXBlOiBtaW1lVHlwZSB9O1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhY3Rpb24obmFtZTogc3RyaW5nKTogSUFjdGlvbiB7XG4gICAgcmV0dXJuIHRoaXMuX2FjdGlvbnNbbmFtZV07XG4gIH1cblxuICBwdWJsaWMgcmVnaXN0ZXIoLi4uYWN0aW9uczogSUFjdGlvbltdKTogdm9pZCB7XG4gICAgZm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuICAgICAgaWYgKCF0aGlzLl9hY3Rpb25zW2FjdGlvbi5uYW1lXSkge1xuICAgICAgICB0aGlzLl9hY3Rpb25zW2FjdGlvbi5uYW1lXSA9IGFjdGlvbjtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuLy8gUmVnaXN0ZXIgYWN0aW9uc1xuSW1hZ2VQcm9jZXNzb3IuZ2V0SW5zdGFuY2UoKS5yZWdpc3RlcihcbiAgbmV3IFJlc2l6ZUFjdGlvbigpLFxuICBuZXcgUXVhbGl0eUFjdGlvbigpLFxuICBuZXcgQnJpZ2h0QWN0aW9uKCksXG4gIG5ldyBGb3JtYXRBY3Rpb24oKSxcbiAgbmV3IEJsdXJBY3Rpb24oKSxcbiAgbmV3IFJvdGF0ZUFjdGlvbigpLFxuICBuZXcgQ29udHJhc3RBY3Rpb24oKSxcbiAgbmV3IFNoYXJwZW5BY3Rpb24oKSxcbiAgbmV3IEludGVybGFjZUFjdGlvbigpLFxuICBuZXcgQXV0b09yaWVudEFjdGlvbigpLFxuICBuZXcgR3JleUFjdGlvbigpLFxuICBuZXcgQ3JvcEFjdGlvbigpLFxuICBuZXcgQ2lyY2xlQWN0aW9uKCksXG4gIG5ldyBJbmRleENyb3BBY3Rpb24oKSxcbiAgbmV3IFJvdW5kZWRDb3JuZXJzQWN0aW9uKCksXG4gIG5ldyBXYXRlcm1hcmtBY3Rpb24oKSxcbiAgbmV3IEluZm9BY3Rpb24oKSxcbiAgbmV3IENnaWZBY3Rpb24oKSxcbiAgbmV3IFN0cmlwTWV0YWRhdGFBY3Rpb24oKSxcbiAgbmV3IFRocmVzaG9sZEFjdGlvbigpLFxuKTtcblxuXG4iXX0=