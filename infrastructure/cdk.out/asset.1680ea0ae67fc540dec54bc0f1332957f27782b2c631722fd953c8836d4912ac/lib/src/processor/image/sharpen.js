"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharpenAction = void 0;
const __1 = require("..");
const is = require("../../is");
const _base_1 = require("./_base");
class SharpenAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'sharpen';
    }
    validate(params) {
        const opt = { sharpen: 0 };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Sharpen param error, e.g: sharpen,100');
        }
        const s = Number.parseInt(params[1], 10);
        if (is.inRange(s, 50, 399)) {
            opt.sharpen = s;
        }
        else {
            throw new __1.InvalidArgument('Sharpen be between 50 and 399');
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        ctx.image.sharpen(opt.sharpen / 100, 0.5, 1);
    }
}
exports.SharpenAction = SharpenAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2hhcnBlbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uL3NyYy9wcm9jZXNzb3IvaW1hZ2Uvc2hhcnBlbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSwwQkFBNEQ7QUFDNUQsK0JBQStCO0FBQy9CLG1DQUEwQztBQU0xQyxNQUFhLGFBQWMsU0FBUSx1QkFBZTtJQUFsRDs7UUFDa0IsU0FBSSxHQUFXLFNBQVMsQ0FBQztJQXNCM0MsQ0FBQztJQXBCUSxRQUFRLENBQUMsTUFBZ0I7UUFDOUIsTUFBTSxHQUFHLEdBQWdCLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBRXhDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDdkIsTUFBTSxJQUFJLG1CQUFlLENBQUMsdUNBQXVDLENBQUMsQ0FBQztTQUNwRTtRQUNELE1BQU0sQ0FBQyxHQUFHLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFLEdBQUcsQ0FBQyxFQUFFO1lBQzFCLEdBQUcsQ0FBQyxPQUFPLEdBQUcsQ0FBQyxDQUFDO1NBQ2pCO2FBQU07WUFDTCxNQUFNLElBQUksbUJBQWUsQ0FBQywrQkFBK0IsQ0FBQyxDQUFDO1NBQzVEO1FBQ0QsT0FBTyxHQUFHLENBQUM7SUFDYixDQUFDO0lBR00sS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFrQixFQUFFLE1BQWdCO1FBQ3ZELE1BQU0sR0FBRyxHQUFHLElBQUksQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDbEMsR0FBRyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLE9BQU8sR0FBRyxHQUFHLEVBQUUsR0FBRyxFQUFFLENBQUMsQ0FBQyxDQUFDO0lBQy9DLENBQUM7Q0FDRjtBQXZCRCxzQ0F1QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJSW1hZ2VDb250ZXh0IH0gZnJvbSAnLic7XG5pbXBvcnQgeyBJQWN0aW9uT3B0cywgUmVhZE9ubHksIEludmFsaWRBcmd1bWVudCB9IGZyb20gJy4uJztcbmltcG9ydCAqIGFzIGlzIGZyb20gJy4uLy4uL2lzJztcbmltcG9ydCB7IEJhc2VJbWFnZUFjdGlvbiB9IGZyb20gJy4vX2Jhc2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFNoYXJwZW5PcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBzaGFycGVuOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBTaGFycGVuQWN0aW9uIGV4dGVuZHMgQmFzZUltYWdlQWN0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyA9ICdzaGFycGVuJztcblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PFNoYXJwZW5PcHRzPiB7XG4gICAgY29uc3Qgb3B0OiBTaGFycGVuT3B0cyA9IHsgc2hhcnBlbjogMCB9O1xuXG4gICAgaWYgKHBhcmFtcy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1NoYXJwZW4gcGFyYW0gZXJyb3IsIGUuZzogc2hhcnBlbiwxMDAnKTtcbiAgICB9XG4gICAgY29uc3QgcyA9IE51bWJlci5wYXJzZUludChwYXJhbXNbMV0sIDEwKTtcbiAgICBpZiAoaXMuaW5SYW5nZShzLCA1MCwgMzk5KSkge1xuICAgICAgb3B0LnNoYXJwZW4gPSBzO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdTaGFycGVuIGJlIGJldHdlZW4gNTAgYW5kIDM5OScpO1xuICAgIH1cbiAgICByZXR1cm4gb3B0O1xuICB9XG5cblxuICBwdWJsaWMgYXN5bmMgcHJvY2VzcyhjdHg6IElJbWFnZUNvbnRleHQsIHBhcmFtczogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBvcHQgPSB0aGlzLnZhbGlkYXRlKHBhcmFtcyk7XG4gICAgY3R4LmltYWdlLnNoYXJwZW4ob3B0LnNoYXJwZW4gLyAxMDAsIDAuNSwgMSk7XG4gIH1cbn0iXX0=