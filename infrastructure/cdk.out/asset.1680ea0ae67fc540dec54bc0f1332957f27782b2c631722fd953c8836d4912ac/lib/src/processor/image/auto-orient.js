"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutoOrientAction = void 0;
const __1 = require("..");
const _base_1 = require("./_base");
class AutoOrientAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'auto-orient';
    }
    beforeNewContext(ctx, _) {
        ctx.features[__1.Features.AutoOrient] = false;
    }
    beforeProcess(ctx, _2, index) {
        if ('gif' === ctx.metadata.format) {
            ctx.mask.disable(index);
        }
    }
    validate(params) {
        const opt = { auto: false };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Auto-orient param error, e.g: auto-orient,1');
        }
        if (params[1] === '1') {
            opt.auto = true;
        }
        else if (params[1] === '0') {
            opt.auto = false;
        }
        else {
            throw new __1.InvalidArgument('Auto-orient param must be 0 or 1');
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        if (opt.auto) {
            ctx.image.rotate();
        }
    }
}
exports.AutoOrientAction = AutoOrientAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXV0by1vcmllbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvY2Vzc29yL2ltYWdlL2F1dG8tb3JpZW50LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDBCQUF1RjtBQUN2RixtQ0FBMEM7QUFNMUMsTUFBYSxnQkFBaUIsU0FBUSx1QkFBZTtJQUFyRDs7UUFDa0IsU0FBSSxHQUFXLGFBQWEsQ0FBQztJQW9DL0MsQ0FBQztJQWxDUSxnQkFBZ0IsQ0FBQyxHQUFvQixFQUFFLENBQVc7UUFDdkQsR0FBRyxDQUFDLFFBQVEsQ0FBQyxZQUFRLENBQUMsVUFBVSxDQUFDLEdBQUcsS0FBSyxDQUFDO0lBQzVDLENBQUM7SUFFTSxhQUFhLENBQUMsR0FBa0IsRUFBRSxFQUFZLEVBQUUsS0FBYTtRQUNsRSxJQUFJLEtBQUssS0FBSyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRTtZQUNqQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN6QjtJQUNILENBQUM7SUFFTSxRQUFRLENBQUMsTUFBZ0I7UUFDOUIsTUFBTSxHQUFHLEdBQW1CLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxDQUFDO1FBRTVDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDdkIsTUFBTSxJQUFJLG1CQUFlLENBQUMsNkNBQTZDLENBQUMsQ0FBQztTQUMxRTtRQUNELElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtZQUNyQixHQUFHLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztTQUNqQjthQUFNLElBQUksTUFBTSxDQUFDLENBQUMsQ0FBQyxLQUFLLEdBQUcsRUFBRTtZQUM1QixHQUFHLENBQUMsSUFBSSxHQUFHLEtBQUssQ0FBQztTQUNsQjthQUFNO1lBQ0wsTUFBTSxJQUFJLG1CQUFlLENBQUMsa0NBQWtDLENBQUMsQ0FBQztTQUMvRDtRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ2IsQ0FBQztJQUdNLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBa0IsRUFBRSxNQUFnQjtRQUN2RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xDLElBQUksR0FBRyxDQUFDLElBQUksRUFBRTtZQUNaLEdBQUcsQ0FBQyxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUM7U0FDcEI7SUFFSCxDQUFDO0NBQ0Y7QUFyQ0QsNENBcUNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgSUltYWdlQ29udGV4dCB9IGZyb20gJy4nO1xuaW1wb3J0IHsgSUFjdGlvbk9wdHMsIFJlYWRPbmx5LCBJbnZhbGlkQXJndW1lbnQsIElQcm9jZXNzQ29udGV4dCwgRmVhdHVyZXMgfSBmcm9tICcuLic7XG5pbXBvcnQgeyBCYXNlSW1hZ2VBY3Rpb24gfSBmcm9tICcuL19iYXNlJztcblxuZXhwb3J0IGludGVyZmFjZSBBdXRvT3JpZW50T3B0cyBleHRlbmRzIElBY3Rpb25PcHRzIHtcbiAgYXV0bzogYm9vbGVhbjtcbn1cblxuZXhwb3J0IGNsYXNzIEF1dG9PcmllbnRBY3Rpb24gZXh0ZW5kcyBCYXNlSW1hZ2VBY3Rpb24ge1xuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ2F1dG8tb3JpZW50JztcblxuICBwdWJsaWMgYmVmb3JlTmV3Q29udGV4dChjdHg6IElQcm9jZXNzQ29udGV4dCwgXzogc3RyaW5nW10pOiB2b2lkIHtcbiAgICBjdHguZmVhdHVyZXNbRmVhdHVyZXMuQXV0b09yaWVudF0gPSBmYWxzZTtcbiAgfVxuXG4gIHB1YmxpYyBiZWZvcmVQcm9jZXNzKGN0eDogSUltYWdlQ29udGV4dCwgXzI6IHN0cmluZ1tdLCBpbmRleDogbnVtYmVyKTogdm9pZCB7XG4gICAgaWYgKCdnaWYnID09PSBjdHgubWV0YWRhdGEuZm9ybWF0KSB7XG4gICAgICBjdHgubWFzay5kaXNhYmxlKGluZGV4KTtcbiAgICB9XG4gIH1cblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PEF1dG9PcmllbnRPcHRzPiB7XG4gICAgY29uc3Qgb3B0OiBBdXRvT3JpZW50T3B0cyA9IHsgYXV0bzogZmFsc2UgfTtcblxuICAgIGlmIChwYXJhbXMubGVuZ3RoICE9PSAyKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdBdXRvLW9yaWVudCBwYXJhbSBlcnJvciwgZS5nOiBhdXRvLW9yaWVudCwxJyk7XG4gICAgfVxuICAgIGlmIChwYXJhbXNbMV0gPT09ICcxJykge1xuICAgICAgb3B0LmF1dG8gPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAocGFyYW1zWzFdID09PSAnMCcpIHtcbiAgICAgIG9wdC5hdXRvID0gZmFsc2U7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0F1dG8tb3JpZW50IHBhcmFtIG11c3QgYmUgMCBvciAxJyk7XG4gICAgfVxuICAgIHJldHVybiBvcHQ7XG4gIH1cblxuXG4gIHB1YmxpYyBhc3luYyBwcm9jZXNzKGN0eDogSUltYWdlQ29udGV4dCwgcGFyYW1zOiBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG9wdCA9IHRoaXMudmFsaWRhdGUocGFyYW1zKTtcbiAgICBpZiAob3B0LmF1dG8pIHtcbiAgICAgIGN0eC5pbWFnZS5yb3RhdGUoKTtcbiAgICB9XG5cbiAgfVxufSJdfQ==