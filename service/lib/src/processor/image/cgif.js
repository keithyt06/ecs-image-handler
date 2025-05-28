"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CgifAction = void 0;
const __1 = require("..");
const is = require("../../is");
const _base_1 = require("./_base");
class CgifAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'cgif';
    }
    beforeNewContext(ctx, params) {
        ctx.features[__1.Features.ReadAllAnimatedFrames] = false;
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Cut gif param error, e.g: cgif,s_1');
        }
        const [k, v] = params[1].split('_');
        if (k === 's') {
            if (!is.inRange(Number.parseInt(v, 10), 1, 1000)) {
                throw new __1.InvalidArgument(`Unkown param: "${k}"`);
            }
            ctx.features[__1.Features.LimitAnimatedFrames] = Number.parseInt(v, 10);
        }
        else {
            throw new __1.InvalidArgument(`Unkown param: "${k}"`);
        }
    }
    validate() {
        let opt = {};
        return opt;
    }
    async process() {
    }
}
exports.CgifAction = CgifAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2dpZi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm9jZXNzb3IvaW1hZ2UvY2dpZi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwwQkFBdUY7QUFDdkYsK0JBQStCO0FBQy9CLG1DQUEwQztBQU8xQyxNQUFhLFVBQVcsU0FBUSx1QkFBZTtJQUEvQzs7UUFDa0IsU0FBSSxHQUFXLE1BQU0sQ0FBQztJQXlCeEMsQ0FBQztJQXZCUSxnQkFBZ0IsQ0FBQyxHQUFvQixFQUFFLE1BQWdCO1FBQzVELEdBQUcsQ0FBQyxRQUFRLENBQUMsWUFBUSxDQUFDLHFCQUFxQixDQUFDLEdBQUcsS0FBSyxDQUFDO1FBQ3JELElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDdkIsTUFBTSxJQUFJLG1CQUFlLENBQUMsb0NBQW9DLENBQUMsQ0FBQztTQUNqRTtRQUNELE1BQU0sQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLEdBQUcsTUFBTSxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztRQUNwQyxJQUFJLENBQUMsS0FBSyxHQUFHLEVBQUU7WUFDYixJQUFJLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ2hELE1BQU0sSUFBSSxtQkFBZSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxDQUFDO2FBQ25EO1lBQ0QsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFRLENBQUMsbUJBQW1CLENBQUMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztTQUNyRTthQUFNO1lBQ0wsTUFBTSxJQUFJLG1CQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDbkQ7SUFDSCxDQUFDO0lBRU0sUUFBUTtRQUNiLElBQUksR0FBRyxHQUFhLEVBQUUsQ0FBQztRQUN2QixPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFFTSxLQUFLLENBQUMsT0FBTztJQUNwQixDQUFDO0NBQ0Y7QUExQkQsZ0NBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSUFjdGlvbk9wdHMsIFJlYWRPbmx5LCBGZWF0dXJlcywgSVByb2Nlc3NDb250ZXh0LCBJbnZhbGlkQXJndW1lbnQgfSBmcm9tICcuLic7XG5pbXBvcnQgKiBhcyBpcyBmcm9tICcuLi8uLi9pcyc7XG5pbXBvcnQgeyBCYXNlSW1hZ2VBY3Rpb24gfSBmcm9tICcuL19iYXNlJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIENnaWZPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBzPzogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgQ2dpZkFjdGlvbiBleHRlbmRzIEJhc2VJbWFnZUFjdGlvbiB7XG4gIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcgPSAnY2dpZic7XG5cbiAgcHVibGljIGJlZm9yZU5ld0NvbnRleHQoY3R4OiBJUHJvY2Vzc0NvbnRleHQsIHBhcmFtczogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjdHguZmVhdHVyZXNbRmVhdHVyZXMuUmVhZEFsbEFuaW1hdGVkRnJhbWVzXSA9IGZhbHNlO1xuICAgIGlmIChwYXJhbXMubGVuZ3RoICE9PSAyKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdDdXQgZ2lmIHBhcmFtIGVycm9yLCBlLmc6IGNnaWYsc18xJyk7XG4gICAgfVxuICAgIGNvbnN0IFtrLCB2XSA9IHBhcmFtc1sxXS5zcGxpdCgnXycpO1xuICAgIGlmIChrID09PSAncycpIHtcbiAgICAgIGlmICghaXMuaW5SYW5nZShOdW1iZXIucGFyc2VJbnQodiwgMTApLCAxLCAxMDAwKSkge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gcGFyYW06IFwiJHtrfVwiYCk7XG4gICAgICB9XG4gICAgICBjdHguZmVhdHVyZXNbRmVhdHVyZXMuTGltaXRBbmltYXRlZEZyYW1lc10gPSBOdW1iZXIucGFyc2VJbnQodiwgMTApO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gcGFyYW06IFwiJHtrfVwiYCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIHZhbGlkYXRlKCk6IFJlYWRPbmx5PENnaWZPcHRzPiB7XG4gICAgbGV0IG9wdDogQ2dpZk9wdHMgPSB7fTtcbiAgICByZXR1cm4gb3B0O1xuICB9XG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gIH1cbn0iXX0=