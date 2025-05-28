"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ThresholdAction = void 0;
const __1 = require("..");
const _base_1 = require("./_base");
class ThresholdAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'threshold';
    }
    beforeProcess(ctx, params, _) {
        const opts = this.validate(params);
        if (ctx.metadata.size && (ctx.metadata.size < opts.threshold)) {
            ctx.mask.disableAll();
        }
    }
    validate(params) {
        if (params.length !== 2) {
            throw new __1.InvalidArgument(`Invalid ${this.name} params, incomplete param`);
        }
        const t = Number.parseInt(params[1], 10);
        if (t <= 0) {
            throw new __1.InvalidArgument(`Invalid ${this.name} params, threshold must be greater than zero`);
        }
        return {
            threshold: t,
        };
    }
    async process(_1, _2) {
        return Promise.resolve();
    }
}
exports.ThresholdAction = ThresholdAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGhyZXNob2xkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci9pbWFnZS90aHJlc2hvbGQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsMEJBQTREO0FBQzVELG1DQUEwQztBQVExQyxNQUFhLGVBQWdCLFNBQVEsdUJBQWU7SUFBcEQ7O1FBQ2tCLFNBQUksR0FBVyxXQUFXLENBQUM7SUEwQjdDLENBQUM7SUF4QlEsYUFBYSxDQUFDLEdBQWtCLEVBQUUsTUFBZ0IsRUFBRSxDQUFTO1FBQ2xFLE1BQU0sSUFBSSxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFbkMsSUFBSSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUM3RCxHQUFHLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxDQUFDO1NBQ3ZCO0lBQ0gsQ0FBQztJQUVNLFFBQVEsQ0FBQyxNQUFnQjtRQUM5QixJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxtQkFBZSxDQUFDLFdBQVcsSUFBSSxDQUFDLElBQUksMkJBQTJCLENBQUMsQ0FBQztTQUM1RTtRQUNELE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUNWLE1BQU0sSUFBSSxtQkFBZSxDQUFDLFdBQVcsSUFBSSxDQUFDLElBQUksOENBQThDLENBQUMsQ0FBQztTQUMvRjtRQUNELE9BQU87WUFDTCxTQUFTLEVBQUUsQ0FBQztTQUNiLENBQUM7SUFDSixDQUFDO0lBRU0sS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFpQixFQUFFLEVBQVk7UUFDbEQsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDM0IsQ0FBQztDQUNGO0FBM0JELDBDQTJCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IElJbWFnZUNvbnRleHQgfSBmcm9tICcuJztcbmltcG9ydCB7IElBY3Rpb25PcHRzLCBSZWFkT25seSwgSW52YWxpZEFyZ3VtZW50IH0gZnJvbSAnLi4nO1xuaW1wb3J0IHsgQmFzZUltYWdlQWN0aW9uIH0gZnJvbSAnLi9fYmFzZSc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBUaHJlc2hvbGRPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICB0aHJlc2hvbGQ6IG51bWJlcjtcbn1cblxuXG5leHBvcnQgY2xhc3MgVGhyZXNob2xkQWN0aW9uIGV4dGVuZHMgQmFzZUltYWdlQWN0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyA9ICd0aHJlc2hvbGQnO1xuXG4gIHB1YmxpYyBiZWZvcmVQcm9jZXNzKGN0eDogSUltYWdlQ29udGV4dCwgcGFyYW1zOiBzdHJpbmdbXSwgXzogbnVtYmVyKTogdm9pZCB7XG4gICAgY29uc3Qgb3B0cyA9IHRoaXMudmFsaWRhdGUocGFyYW1zKTtcblxuICAgIGlmIChjdHgubWV0YWRhdGEuc2l6ZSAmJiAoY3R4Lm1ldGFkYXRhLnNpemUgPCBvcHRzLnRocmVzaG9sZCkpIHtcbiAgICAgIGN0eC5tYXNrLmRpc2FibGVBbGwoKTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PFRocmVzaG9sZE9wdHM+IHtcbiAgICBpZiAocGFyYW1zLmxlbmd0aCAhPT0gMikge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgSW52YWxpZCAke3RoaXMubmFtZX0gcGFyYW1zLCBpbmNvbXBsZXRlIHBhcmFtYCk7XG4gICAgfVxuICAgIGNvbnN0IHQgPSBOdW1iZXIucGFyc2VJbnQocGFyYW1zWzFdLCAxMCk7XG4gICAgaWYgKHQgPD0gMCkge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudChgSW52YWxpZCAke3RoaXMubmFtZX0gcGFyYW1zLCB0aHJlc2hvbGQgbXVzdCBiZSBncmVhdGVyIHRoYW4gemVyb2ApO1xuICAgIH1cbiAgICByZXR1cm4ge1xuICAgICAgdGhyZXNob2xkOiB0LFxuICAgIH07XG4gIH1cblxuICBwdWJsaWMgYXN5bmMgcHJvY2VzcyhfMTogSUltYWdlQ29udGV4dCwgXzI6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICB9XG59Il19