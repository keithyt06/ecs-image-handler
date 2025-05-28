"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VideoProcessor = void 0;
const __1 = require("..");
const _base_1 = require("../image/_base");
const is = require("../../is");
const snapshot_action_1 = require("./snapshot.action");
const compress_action_1 = require("./compress.action");
const transcode_action_1 = require("./transcode.action");
__exportStar(require("./context"), exports);
__exportStar(require("./snapshot.action"), exports);
__exportStar(require("./compress.action"), exports);
__exportStar(require("./transcode.action"), exports);
/**
 * 视频处理器 - 支持截图、转码、压缩等操作
 */
class VideoProcessor {
    static getInstance() {
        if (!VideoProcessor._instance) {
            const instance = new VideoProcessor();
            // 注册默认的视频处理功能
            instance.register(new snapshot_action_1.SnapshotAction(), new compress_action_1.CompressAction(), new transcode_action_1.TranscodeAction());
            VideoProcessor._instance = instance;
        }
        return VideoProcessor._instance;
    }
    constructor() {
        this.actions = new Map();
        this.name = 'video';
    }
    register(...actions) {
        for (const action of actions) {
            this.actions.set(action.name, action);
            console.log(`已注册视频处理Action: ${action.name}`);
        }
    }
    async newContext(uri, actions, bufferStore) {
        const ctx = {
            uri,
            actions,
            mask: new _base_1.ActionMask(actions),
            bufferStore,
            features: {},
            headers: {}
        };
        return Promise.resolve(ctx);
    }
    async process(ctx) {
        if (!ctx.actions || ctx.actions.length < 2) {
            throw new __1.InvalidArgument('Invalid video request! Actions not provided.');
        }
        const action = ctx.actions[1];
        if (!is.string(action)) {
            throw new __1.InvalidArgument('Invalid action format!');
        }
        const params = action.split(',');
        const actionName = params[0];
        const actionHandler = this.actions.get(actionName);
        if (!actionHandler) {
            throw new __1.InvalidArgument(`Unsupported video action: ${actionName}`);
        }
        console.log(`处理视频请求: ${ctx.uri}, 操作: ${actionName}`);
        // 转换为扩展上下文类型
        const extCtx = ctx;
        // 调用相应的Action处理
        await actionHandler.process(extCtx, params);
        // 如果Action没有设置结果，返回空JSON
        if (!extCtx.result) {
            return { data: '{}', type: 'application/json' };
        }
        // 返回处理结果
        return {
            data: extCtx.result.data,
            type: extCtx.result.type
        };
    }
}
exports.VideoProcessor = VideoProcessor;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5kZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvY2Vzc29yL3ZpZGVvL2luZGV4LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsMEJBQTZGO0FBQzdGLDBDQUE0QztBQUU1QywrQkFBK0I7QUFFL0IsdURBQW1EO0FBQ25ELHVEQUFtRDtBQUNuRCx5REFBcUQ7QUFFckQsNENBQTBCO0FBQzFCLG9EQUFrQztBQUNsQyxvREFBa0M7QUFDbEMscURBQW1DO0FBRW5DOztHQUVHO0FBQ0gsTUFBYSxjQUFjO0lBQ2xCLE1BQU0sQ0FBQyxXQUFXO1FBQ3ZCLElBQUksQ0FBQyxjQUFjLENBQUMsU0FBUyxFQUFFO1lBQzdCLE1BQU0sUUFBUSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFFdEMsY0FBYztZQUNkLFFBQVEsQ0FBQyxRQUFRLENBQ2YsSUFBSSxnQ0FBYyxFQUFFLEVBQ3BCLElBQUksZ0NBQWMsRUFBRSxFQUNwQixJQUFJLGtDQUFlLEVBQUUsQ0FDdEIsQ0FBQztZQUVGLGNBQWMsQ0FBQyxTQUFTLEdBQUcsUUFBUSxDQUFDO1NBQ3JDO1FBQ0QsT0FBTyxjQUFjLENBQUMsU0FBUyxDQUFDO0lBQ2xDLENBQUM7SUFNRDtRQUhRLFlBQU8sR0FBeUIsSUFBSSxHQUFHLEVBQUUsQ0FBQztRQUNsQyxTQUFJLEdBQVcsT0FBTyxDQUFDO0lBRWYsQ0FBQztJQUVsQixRQUFRLENBQUMsR0FBRyxPQUFrQjtRQUNuQyxLQUFLLE1BQU0sTUFBTSxJQUFJLE9BQU8sRUFBRTtZQUM1QixJQUFJLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxDQUFDO1lBQ3RDLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLE1BQU0sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO1NBQzlDO0lBQ0gsQ0FBQztJQUVNLEtBQUssQ0FBQyxVQUFVLENBQUMsR0FBVyxFQUFFLE9BQWlCLEVBQUUsV0FBeUI7UUFDL0UsTUFBTSxHQUFHLEdBQTRCO1lBQ25DLEdBQUc7WUFDSCxPQUFPO1lBQ1AsSUFBSSxFQUFFLElBQUksa0JBQVUsQ0FBQyxPQUFPLENBQUM7WUFDN0IsV0FBVztZQUNYLFFBQVEsRUFBRSxFQUFFO1lBQ1osT0FBTyxFQUFFLEVBQUU7U0FDWixDQUFDO1FBRUYsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0lBQzlCLENBQUM7SUFFTSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQW9CO1FBQ3ZDLElBQUksQ0FBQyxHQUFHLENBQUMsT0FBTyxJQUFJLEdBQUcsQ0FBQyxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtZQUMxQyxNQUFNLElBQUksbUJBQWUsQ0FBQyw4Q0FBOEMsQ0FBQyxDQUFDO1NBQzNFO1FBRUQsTUFBTSxNQUFNLEdBQUcsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUM5QixJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN0QixNQUFNLElBQUksbUJBQWUsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1NBQ3JEO1FBRUQsTUFBTSxNQUFNLEdBQUcsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNqQyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IsTUFBTSxhQUFhLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVSxDQUFDLENBQUM7UUFFbkQsSUFBSSxDQUFDLGFBQWEsRUFBRTtZQUNsQixNQUFNLElBQUksbUJBQWUsQ0FBQyw2QkFBNkIsVUFBVSxFQUFFLENBQUMsQ0FBQztTQUN0RTtRQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxHQUFHLENBQUMsR0FBRyxTQUFTLFVBQVUsRUFBRSxDQUFDLENBQUM7UUFFckQsYUFBYTtRQUNiLE1BQU0sTUFBTSxHQUFHLEdBQThCLENBQUM7UUFFOUMsZ0JBQWdCO1FBQ2hCLE1BQU0sYUFBYSxDQUFDLE9BQU8sQ0FBQyxNQUFNLEVBQUUsTUFBTSxDQUFDLENBQUM7UUFFNUMseUJBQXlCO1FBQ3pCLElBQUksQ0FBQyxNQUFNLENBQUMsTUFBTSxFQUFFO1lBQ2xCLE9BQU8sRUFBRSxJQUFJLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxrQkFBa0IsRUFBRSxDQUFDO1NBQ2pEO1FBRUQsU0FBUztRQUNULE9BQU87WUFDTCxJQUFJLEVBQUUsTUFBTSxDQUFDLE1BQU0sQ0FBQyxJQUFJO1lBQ3hCLElBQUksRUFBRSxNQUFNLENBQUMsTUFBTSxDQUFDLElBQUk7U0FDekIsQ0FBQztJQUNKLENBQUM7Q0FDRjtBQWhGRCx3Q0FnRkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJQWN0aW9uLCBJbnZhbGlkQXJndW1lbnQsIElQcm9jZXNzQ29udGV4dCwgSVByb2Nlc3NvciwgSVByb2Nlc3NSZXNwb25zZSB9IGZyb20gJy4uJztcbmltcG9ydCB7IEFjdGlvbk1hc2sgfSBmcm9tICcuLi9pbWFnZS9fYmFzZSc7XG5pbXBvcnQgeyBJQnVmZmVyU3RvcmUgfSBmcm9tICcuLi8uLi9zdG9yZSc7XG5pbXBvcnQgKiBhcyBpcyBmcm9tICcuLi8uLi9pcyc7XG5pbXBvcnQgeyBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCB9IGZyb20gJy4vY29udGV4dCc7XG5pbXBvcnQgeyBTbmFwc2hvdEFjdGlvbiB9IGZyb20gJy4vc25hcHNob3QuYWN0aW9uJztcbmltcG9ydCB7IENvbXByZXNzQWN0aW9uIH0gZnJvbSAnLi9jb21wcmVzcy5hY3Rpb24nO1xuaW1wb3J0IHsgVHJhbnNjb2RlQWN0aW9uIH0gZnJvbSAnLi90cmFuc2NvZGUuYWN0aW9uJztcblxuZXhwb3J0ICogZnJvbSAnLi9jb250ZXh0JztcbmV4cG9ydCAqIGZyb20gJy4vc25hcHNob3QuYWN0aW9uJztcbmV4cG9ydCAqIGZyb20gJy4vY29tcHJlc3MuYWN0aW9uJztcbmV4cG9ydCAqIGZyb20gJy4vdHJhbnNjb2RlLmFjdGlvbic7XG5cbi8qKlxuICog6KeG6aKR5aSE55CG5ZmoIC0g5pSv5oyB5oiq5Zu+44CB6L2s56CB44CB5Y6L57yp562J5pON5L2cXG4gKi9cbmV4cG9ydCBjbGFzcyBWaWRlb1Byb2Nlc3NvciBpbXBsZW1lbnRzIElQcm9jZXNzb3Ige1xuICBwdWJsaWMgc3RhdGljIGdldEluc3RhbmNlKCk6IFZpZGVvUHJvY2Vzc29yIHtcbiAgICBpZiAoIVZpZGVvUHJvY2Vzc29yLl9pbnN0YW5jZSkge1xuICAgICAgY29uc3QgaW5zdGFuY2UgPSBuZXcgVmlkZW9Qcm9jZXNzb3IoKTtcbiAgICAgIFxuICAgICAgLy8g5rOo5YaM6buY6K6k55qE6KeG6aKR5aSE55CG5Yqf6IO9XG4gICAgICBpbnN0YW5jZS5yZWdpc3RlcihcbiAgICAgICAgbmV3IFNuYXBzaG90QWN0aW9uKCksXG4gICAgICAgIG5ldyBDb21wcmVzc0FjdGlvbigpLFxuICAgICAgICBuZXcgVHJhbnNjb2RlQWN0aW9uKClcbiAgICAgICk7XG4gICAgICBcbiAgICAgIFZpZGVvUHJvY2Vzc29yLl9pbnN0YW5jZSA9IGluc3RhbmNlO1xuICAgIH1cbiAgICByZXR1cm4gVmlkZW9Qcm9jZXNzb3IuX2luc3RhbmNlO1xuICB9XG4gIFxuICBwcml2YXRlIHN0YXRpYyBfaW5zdGFuY2U6IFZpZGVvUHJvY2Vzc29yO1xuICBwcml2YXRlIGFjdGlvbnM6IE1hcDxzdHJpbmcsIElBY3Rpb24+ID0gbmV3IE1hcCgpO1xuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ3ZpZGVvJztcblxuICBwcml2YXRlIGNvbnN0cnVjdG9yKCkgeyB9XG5cbiAgcHVibGljIHJlZ2lzdGVyKC4uLmFjdGlvbnM6IElBY3Rpb25bXSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgYWN0aW9uIG9mIGFjdGlvbnMpIHtcbiAgICAgIHRoaXMuYWN0aW9ucy5zZXQoYWN0aW9uLm5hbWUsIGFjdGlvbik7XG4gICAgICBjb25zb2xlLmxvZyhg5bey5rOo5YaM6KeG6aKR5aSE55CGQWN0aW9uOiAke2FjdGlvbi5uYW1lfWApO1xuICAgIH1cbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBuZXdDb250ZXh0KHVyaTogc3RyaW5nLCBhY3Rpb25zOiBzdHJpbmdbXSwgYnVmZmVyU3RvcmU6IElCdWZmZXJTdG9yZSk6IFByb21pc2U8SVByb2Nlc3NDb250ZXh0PiB7XG4gICAgY29uc3QgY3R4OiBJRXh0ZW5kZWRQcm9jZXNzQ29udGV4dCA9IHtcbiAgICAgIHVyaSxcbiAgICAgIGFjdGlvbnMsXG4gICAgICBtYXNrOiBuZXcgQWN0aW9uTWFzayhhY3Rpb25zKSxcbiAgICAgIGJ1ZmZlclN0b3JlLFxuICAgICAgZmVhdHVyZXM6IHt9LFxuICAgICAgaGVhZGVyczoge31cbiAgICB9O1xuICAgIFxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY3R4KTtcbiAgfVxuXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzKGN0eDogSVByb2Nlc3NDb250ZXh0KTogUHJvbWlzZTxJUHJvY2Vzc1Jlc3BvbnNlPiB7XG4gICAgaWYgKCFjdHguYWN0aW9ucyB8fCBjdHguYWN0aW9ucy5sZW5ndGggPCAyKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdJbnZhbGlkIHZpZGVvIHJlcXVlc3QhIEFjdGlvbnMgbm90IHByb3ZpZGVkLicpO1xuICAgIH1cbiAgICBcbiAgICBjb25zdCBhY3Rpb24gPSBjdHguYWN0aW9uc1sxXTtcbiAgICBpZiAoIWlzLnN0cmluZyhhY3Rpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdJbnZhbGlkIGFjdGlvbiBmb3JtYXQhJyk7XG4gICAgfVxuICAgIFxuICAgIGNvbnN0IHBhcmFtcyA9IGFjdGlvbi5zcGxpdCgnLCcpO1xuICAgIGNvbnN0IGFjdGlvbk5hbWUgPSBwYXJhbXNbMF07XG4gICAgY29uc3QgYWN0aW9uSGFuZGxlciA9IHRoaXMuYWN0aW9ucy5nZXQoYWN0aW9uTmFtZSk7XG4gICAgXG4gICAgaWYgKCFhY3Rpb25IYW5kbGVyKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbnN1cHBvcnRlZCB2aWRlbyBhY3Rpb246ICR7YWN0aW9uTmFtZX1gKTtcbiAgICB9XG4gICAgXG4gICAgY29uc29sZS5sb2coYOWkhOeQhuinhumikeivt+axgjogJHtjdHgudXJpfSwg5pON5L2cOiAke2FjdGlvbk5hbWV9YCk7XG4gICAgXG4gICAgLy8g6L2s5o2i5Li65omp5bGV5LiK5LiL5paH57G75Z6LXG4gICAgY29uc3QgZXh0Q3R4ID0gY3R4IGFzIElFeHRlbmRlZFByb2Nlc3NDb250ZXh0O1xuICAgIFxuICAgIC8vIOiwg+eUqOebuOW6lOeahEFjdGlvbuWkhOeQhlxuICAgIGF3YWl0IGFjdGlvbkhhbmRsZXIucHJvY2VzcyhleHRDdHgsIHBhcmFtcyk7XG4gICAgXG4gICAgLy8g5aaC5p6cQWN0aW9u5rKh5pyJ6K6+572u57uT5p6c77yM6L+U5Zue56m6SlNPTlxuICAgIGlmICghZXh0Q3R4LnJlc3VsdCkge1xuICAgICAgcmV0dXJuIHsgZGF0YTogJ3t9JywgdHlwZTogJ2FwcGxpY2F0aW9uL2pzb24nIH07XG4gICAgfVxuICAgIFxuICAgIC8vIOi/lOWbnuWkhOeQhue7k+aenFxuICAgIHJldHVybiB7XG4gICAgICBkYXRhOiBleHRDdHgucmVzdWx0LmRhdGEsXG4gICAgICB0eXBlOiBleHRDdHgucmVzdWx0LnR5cGVcbiAgICB9O1xuICB9XG59XG4iXX0=