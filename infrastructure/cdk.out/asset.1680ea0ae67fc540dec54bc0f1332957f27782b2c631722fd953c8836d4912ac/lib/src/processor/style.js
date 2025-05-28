"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StyleProcessor = void 0;
const _1 = require(".");
const is = require("../is");
const store_1 = require("../store");
const _base_1 = require("./image/_base");
const index_1 = require("./image/index");
const video_1 = require("./video");
const PROCESSOR_MAP = {
    [index_1.ImageProcessor.getInstance().name]: index_1.ImageProcessor.getInstance(),
    [video_1.VideoProcessor.getInstance().name]: video_1.VideoProcessor.getInstance(),
};
class StyleProcessor {
    constructor() {
        this.name = 'style';
        this._kvstore = new store_1.MemKVStore({});
    }
    static getInstance(kvstore) {
        if (!StyleProcessor._instance) {
            StyleProcessor._instance = new StyleProcessor();
        }
        if (kvstore) {
            StyleProcessor._instance._kvstore = kvstore;
        }
        return StyleProcessor._instance;
    }
    async newContext(uri, actions, bufferStore) {
        return Promise.resolve({
            uri,
            actions,
            mask: new _base_1.ActionMask(actions),
            bufferStore,
            headers: {},
            features: {},
        });
    }
    // e.g. https://Host/ObjectName?x-oss-process=style/<StyleName>
    async process(ctx) {
        if (ctx.actions.length !== 2) {
            throw new _1.InvalidArgument('Invalid style!');
        }
        const stylename = ctx.actions[1];
        if (!stylename.match(/^[\w\-_\.]{1,63}$/)) {
            throw new _1.InvalidArgument('Invalid style name!');
        }
        // {
        //   "id": "stylename",
        //   "style": "image/resize,w_100,h_100"
        // }
        const { style } = await this._kvstore.get(stylename);
        const param = style; // e.g. image/resize,w_100,h_100,m_fixed,limit_0/
        if (is.string(param)) {
            const acts = param.split('/').filter((x) => x);
            const processor = PROCESSOR_MAP[acts[0]];
            if (!processor) {
                throw new _1.InvalidArgument('Can Not find processor');
            }
            const context = await processor.newContext(ctx.uri, acts, ctx.bufferStore);
            return processor.process(context);
        }
        else {
            throw new _1.InvalidArgument('Style not found');
        }
    }
    register(..._) { }
}
exports.StyleProcessor = StyleProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvcHJvY2Vzc29yL3N0eWxlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFBLHdCQUE0RjtBQUM1Riw0QkFBNEI7QUFDNUIsb0NBQThEO0FBQzlELHlDQUEyQztBQUMzQyx5Q0FBK0M7QUFDL0MsbUNBQXlDO0FBR3pDLE1BQU0sYUFBYSxHQUFrQztJQUNuRCxDQUFDLHNCQUFjLENBQUMsV0FBVyxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUUsc0JBQWMsQ0FBQyxXQUFXLEVBQUU7SUFDakUsQ0FBQyxzQkFBYyxDQUFDLFdBQVcsRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFLHNCQUFjLENBQUMsV0FBVyxFQUFFO0NBQ2xFLENBQUM7QUFHRixNQUFhLGNBQWM7SUFlekI7UUFIZ0IsU0FBSSxHQUFXLE9BQU8sQ0FBQztRQUMvQixhQUFRLEdBQWEsSUFBSSxrQkFBVSxDQUFDLEVBQUUsQ0FBQyxDQUFDO0lBRXhCLENBQUM7SUFkbEIsTUFBTSxDQUFDLFdBQVcsQ0FBQyxPQUFrQjtRQUMxQyxJQUFJLENBQUMsY0FBYyxDQUFDLFNBQVMsRUFBRTtZQUM3QixjQUFjLENBQUMsU0FBUyxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7U0FDakQ7UUFDRCxJQUFJLE9BQU8sRUFBRTtZQUNYLGNBQWMsQ0FBQyxTQUFTLENBQUMsUUFBUSxHQUFHLE9BQU8sQ0FBQztTQUM3QztRQUNELE9BQU8sY0FBYyxDQUFDLFNBQVMsQ0FBQztJQUNsQyxDQUFDO0lBUU0sS0FBSyxDQUFDLFVBQVUsQ0FBQyxHQUFXLEVBQUUsT0FBaUIsRUFBRSxXQUF5QjtRQUMvRSxPQUFPLE9BQU8sQ0FBQyxPQUFPLENBQUM7WUFDckIsR0FBRztZQUNILE9BQU87WUFDUCxJQUFJLEVBQUUsSUFBSSxrQkFBVSxDQUFDLE9BQU8sQ0FBQztZQUM3QixXQUFXO1lBQ1gsT0FBTyxFQUFFLEVBQUU7WUFDWCxRQUFRLEVBQUUsRUFBRTtTQUNiLENBQUMsQ0FBQztJQUNMLENBQUM7SUFFRCwrREFBK0Q7SUFDeEQsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFvQjtRQUN2QyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtZQUM1QixNQUFNLElBQUksa0JBQWUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1NBQzdDO1FBQ0QsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUNqQyxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQ3pDLE1BQU0sSUFBSSxrQkFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7U0FDbEQ7UUFDRCxJQUFJO1FBQ0osdUJBQXVCO1FBQ3ZCLHdDQUF3QztRQUN4QyxJQUFJO1FBQ0osTUFBTSxFQUFFLEtBQUssRUFBRSxHQUFHLE1BQU0sSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLENBQUM7UUFDckQsTUFBTSxLQUFLLEdBQUcsS0FBSyxDQUFDLENBQUMsaURBQWlEO1FBQ3RFLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLENBQUMsRUFBRTtZQUNwQixNQUFNLElBQUksR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQU0sRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDcEQsTUFBTSxTQUFTLEdBQUcsYUFBYSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3pDLElBQUksQ0FBQyxTQUFTLEVBQUU7Z0JBQ2QsTUFBTSxJQUFJLGtCQUFlLENBQUMsd0JBQXdCLENBQUMsQ0FBQzthQUNyRDtZQUNELE1BQU0sT0FBTyxHQUFHLE1BQU0sU0FBUyxDQUFDLFVBQVUsQ0FBQyxHQUFHLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDM0UsT0FBTyxTQUFTLENBQUMsT0FBTyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1NBQ25DO2FBQU07WUFDTCxNQUFNLElBQUksa0JBQWUsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1NBQzlDO0lBQ0gsQ0FBQztJQUVNLFFBQVEsQ0FBQyxHQUFHLENBQVksSUFBVSxDQUFDO0NBQzNDO0FBekRELHdDQXlEQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IElBY3Rpb24sIEludmFsaWRBcmd1bWVudCwgSVByb2Nlc3NDb250ZXh0LCBJUHJvY2Vzc29yLCBJUHJvY2Vzc1Jlc3BvbnNlIH0gZnJvbSAnLic7XG5pbXBvcnQgKiBhcyBpcyBmcm9tICcuLi9pcyc7XG5pbXBvcnQgeyBJQnVmZmVyU3RvcmUsIElLVlN0b3JlLCBNZW1LVlN0b3JlIH0gZnJvbSAnLi4vc3RvcmUnO1xuaW1wb3J0IHsgQWN0aW9uTWFzayB9IGZyb20gJy4vaW1hZ2UvX2Jhc2UnO1xuaW1wb3J0IHsgSW1hZ2VQcm9jZXNzb3IgfSBmcm9tICcuL2ltYWdlL2luZGV4JztcbmltcG9ydCB7IFZpZGVvUHJvY2Vzc29yIH0gZnJvbSAnLi92aWRlbyc7XG5cblxuY29uc3QgUFJPQ0VTU09SX01BUDogeyBba2V5OiBzdHJpbmddOiBJUHJvY2Vzc29yIH0gPSB7XG4gIFtJbWFnZVByb2Nlc3Nvci5nZXRJbnN0YW5jZSgpLm5hbWVdOiBJbWFnZVByb2Nlc3Nvci5nZXRJbnN0YW5jZSgpLFxuICBbVmlkZW9Qcm9jZXNzb3IuZ2V0SW5zdGFuY2UoKS5uYW1lXTogVmlkZW9Qcm9jZXNzb3IuZ2V0SW5zdGFuY2UoKSxcbn07XG5cblxuZXhwb3J0IGNsYXNzIFN0eWxlUHJvY2Vzc29yIGltcGxlbWVudHMgSVByb2Nlc3NvciB7XG4gIHB1YmxpYyBzdGF0aWMgZ2V0SW5zdGFuY2Uoa3ZzdG9yZT86IElLVlN0b3JlKTogU3R5bGVQcm9jZXNzb3Ige1xuICAgIGlmICghU3R5bGVQcm9jZXNzb3IuX2luc3RhbmNlKSB7XG4gICAgICBTdHlsZVByb2Nlc3Nvci5faW5zdGFuY2UgPSBuZXcgU3R5bGVQcm9jZXNzb3IoKTtcbiAgICB9XG4gICAgaWYgKGt2c3RvcmUpIHtcbiAgICAgIFN0eWxlUHJvY2Vzc29yLl9pbnN0YW5jZS5fa3ZzdG9yZSA9IGt2c3RvcmU7XG4gICAgfVxuICAgIHJldHVybiBTdHlsZVByb2Nlc3Nvci5faW5zdGFuY2U7XG4gIH1cbiAgcHJpdmF0ZSBzdGF0aWMgX2luc3RhbmNlOiBTdHlsZVByb2Nlc3NvcjtcblxuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ3N0eWxlJztcbiAgcHJpdmF0ZSBfa3ZzdG9yZTogSUtWU3RvcmUgPSBuZXcgTWVtS1ZTdG9yZSh7fSk7XG5cbiAgcHJpdmF0ZSBjb25zdHJ1Y3RvcigpIHsgfVxuXG4gIHB1YmxpYyBhc3luYyBuZXdDb250ZXh0KHVyaTogc3RyaW5nLCBhY3Rpb25zOiBzdHJpbmdbXSwgYnVmZmVyU3RvcmU6IElCdWZmZXJTdG9yZSk6IFByb21pc2U8SVByb2Nlc3NDb250ZXh0PiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICB1cmksXG4gICAgICBhY3Rpb25zLFxuICAgICAgbWFzazogbmV3IEFjdGlvbk1hc2soYWN0aW9ucyksXG4gICAgICBidWZmZXJTdG9yZSxcbiAgICAgIGhlYWRlcnM6IHt9LFxuICAgICAgZmVhdHVyZXM6IHt9LFxuICAgIH0pO1xuICB9XG5cbiAgLy8gZS5nLiBodHRwczovL0hvc3QvT2JqZWN0TmFtZT94LW9zcy1wcm9jZXNzPXN0eWxlLzxTdHlsZU5hbWU+XG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzKGN0eDogSVByb2Nlc3NDb250ZXh0KTogUHJvbWlzZTxJUHJvY2Vzc1Jlc3BvbnNlPiB7XG4gICAgaWYgKGN0eC5hY3Rpb25zLmxlbmd0aCAhPT0gMikge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnSW52YWxpZCBzdHlsZSEnKTtcbiAgICB9XG4gICAgY29uc3Qgc3R5bGVuYW1lID0gY3R4LmFjdGlvbnNbMV07XG4gICAgaWYgKCFzdHlsZW5hbWUubWF0Y2goL15bXFx3XFwtX1xcLl17MSw2M30kLykpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0ludmFsaWQgc3R5bGUgbmFtZSEnKTtcbiAgICB9XG4gICAgLy8ge1xuICAgIC8vICAgXCJpZFwiOiBcInN0eWxlbmFtZVwiLFxuICAgIC8vICAgXCJzdHlsZVwiOiBcImltYWdlL3Jlc2l6ZSx3XzEwMCxoXzEwMFwiXG4gICAgLy8gfVxuICAgIGNvbnN0IHsgc3R5bGUgfSA9IGF3YWl0IHRoaXMuX2t2c3RvcmUuZ2V0KHN0eWxlbmFtZSk7XG4gICAgY29uc3QgcGFyYW0gPSBzdHlsZTsgLy8gZS5nLiBpbWFnZS9yZXNpemUsd18xMDAsaF8xMDAsbV9maXhlZCxsaW1pdF8wL1xuICAgIGlmIChpcy5zdHJpbmcocGFyYW0pKSB7XG4gICAgICBjb25zdCBhY3RzID0gcGFyYW0uc3BsaXQoJy8nKS5maWx0ZXIoKHg6IGFueSkgPT4geCk7XG4gICAgICBjb25zdCBwcm9jZXNzb3IgPSBQUk9DRVNTT1JfTUFQW2FjdHNbMF1dO1xuICAgICAgaWYgKCFwcm9jZXNzb3IpIHtcbiAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnQ2FuIE5vdCBmaW5kIHByb2Nlc3NvcicpO1xuICAgICAgfVxuICAgICAgY29uc3QgY29udGV4dCA9IGF3YWl0IHByb2Nlc3Nvci5uZXdDb250ZXh0KGN0eC51cmksIGFjdHMsIGN0eC5idWZmZXJTdG9yZSk7XG4gICAgICByZXR1cm4gcHJvY2Vzc29yLnByb2Nlc3MoY29udGV4dCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1N0eWxlIG5vdCBmb3VuZCcpO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyByZWdpc3RlciguLi5fOiBJQWN0aW9uW10pOiB2b2lkIHsgfVxufVxuIl19