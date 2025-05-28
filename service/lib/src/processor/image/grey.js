"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GreyAction = void 0;
const __1 = require("..");
const _base_1 = require("./_base");
class GreyAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'grey';
    }
    validate(params) {
        let opt = { grey: false };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Grey param error, e.g: grey,1');
        }
        if (params[1] === '1') {
            opt.grey = true;
        }
        else if (params[1] === '0') {
            opt.grey = false;
        }
        else {
            throw new __1.InvalidArgument('Grey must be 0 or 1');
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        if (opt.grey) {
            ctx.image.greyscale();
        }
    }
}
exports.GreyAction = GreyAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ3JleS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm9jZXNzb3IvaW1hZ2UvZ3JleS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQkFBNEQ7QUFDNUQsbUNBQTBDO0FBTTFDLE1BQWEsVUFBVyxTQUFRLHVCQUFlO0lBQS9DOztRQUNrQixTQUFJLEdBQVcsTUFBTSxDQUFDO0lBMkJ4QyxDQUFDO0lBekJRLFFBQVEsQ0FBQyxNQUFnQjtRQUM5QixJQUFJLEdBQUcsR0FBYSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUVwQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxtQkFBZSxDQUFDLCtCQUErQixDQUFDLENBQUM7U0FDNUQ7UUFDRCxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7WUFDckIsR0FBRyxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7U0FDakI7YUFBTSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7WUFDNUIsR0FBRyxDQUFDLElBQUksR0FBRyxLQUFLLENBQUM7U0FFbEI7YUFBTTtZQUNMLE1BQU0sSUFBSSxtQkFBZSxDQUFDLHFCQUFxQixDQUFDLENBQUM7U0FDbEQ7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFHTSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQWtCLEVBQUUsTUFBZ0I7UUFDdkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQyxJQUFJLEdBQUcsQ0FBQyxJQUFJLEVBQUU7WUFDWixHQUFHLENBQUMsS0FBSyxDQUFDLFNBQVMsRUFBRSxDQUFDO1NBQ3ZCO0lBRUgsQ0FBQztDQUNGO0FBNUJELGdDQTRCQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IElJbWFnZUNvbnRleHQgfSBmcm9tICcuJztcbmltcG9ydCB7IElBY3Rpb25PcHRzLCBSZWFkT25seSwgSW52YWxpZEFyZ3VtZW50IH0gZnJvbSAnLi4nO1xuaW1wb3J0IHsgQmFzZUltYWdlQWN0aW9uIH0gZnJvbSAnLi9fYmFzZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgR3JleU9wdHMgZXh0ZW5kcyBJQWN0aW9uT3B0cyB7XG4gIGdyZXk6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBHcmV5QWN0aW9uIGV4dGVuZHMgQmFzZUltYWdlQWN0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyA9ICdncmV5JztcblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PEdyZXlPcHRzPiB7XG4gICAgbGV0IG9wdDogR3JleU9wdHMgPSB7IGdyZXk6IGZhbHNlIH07XG5cbiAgICBpZiAocGFyYW1zLmxlbmd0aCAhPT0gMikge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnR3JleSBwYXJhbSBlcnJvciwgZS5nOiBncmV5LDEnKTtcbiAgICB9XG4gICAgaWYgKHBhcmFtc1sxXSA9PT0gJzEnKSB7XG4gICAgICBvcHQuZ3JleSA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChwYXJhbXNbMV0gPT09ICcwJykge1xuICAgICAgb3B0LmdyZXkgPSBmYWxzZTtcblxuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdHcmV5IG11c3QgYmUgMCBvciAxJyk7XG4gICAgfVxuICAgIHJldHVybiBvcHQ7XG4gIH1cblxuXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzKGN0eDogSUltYWdlQ29udGV4dCwgcGFyYW1zOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG9wdCA9IHRoaXMudmFsaWRhdGUocGFyYW1zKTtcbiAgICBpZiAob3B0LmdyZXkpIHtcbiAgICAgIGN0eC5pbWFnZS5ncmV5c2NhbGUoKTtcbiAgICB9XG5cbiAgfVxufSJdfQ==