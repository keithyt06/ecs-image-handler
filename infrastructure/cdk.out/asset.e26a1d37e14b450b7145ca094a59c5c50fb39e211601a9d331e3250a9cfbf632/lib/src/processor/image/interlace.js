"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InterlaceAction = void 0;
const __1 = require("..");
const _base_1 = require("./_base");
class InterlaceAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'interlace';
    }
    validate(params) {
        let opt = { interlace: false };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Interlace param error, e.g: interlace,1');
        }
        if (params[1] === '1') {
            opt.interlace = true;
        }
        else if (params[1] === '0') {
            opt.interlace = false;
        }
        else {
            throw new __1.InvalidArgument('Interlace must be 0 or 1');
        }
        return opt;
    }
    beforeProcess(ctx, _2, index) {
        if ('gif' === ctx.metadata.format) {
            ctx.mask.disable(index);
        }
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        const metadata = ctx.metadata;
        if (('jpg' === metadata.format || 'jpeg' === metadata.format) && opt.interlace) {
            ctx.image.jpeg({ progressive: true });
        }
    }
}
exports.InterlaceAction = InterlaceAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW50ZXJsYWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci9pbWFnZS9pbnRlcmxhY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsMEJBQTREO0FBQzVELG1DQUEwQztBQUsxQyxNQUFhLGVBQWdCLFNBQVEsdUJBQWU7SUFBcEQ7O1FBQ2tCLFNBQUksR0FBVyxXQUFXLENBQUM7SUErQjdDLENBQUM7SUE3QlEsUUFBUSxDQUFDLE1BQWdCO1FBQzlCLElBQUksR0FBRyxHQUFrQixFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQztRQUU5QyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxtQkFBZSxDQUFDLHlDQUF5QyxDQUFDLENBQUM7U0FDdEU7UUFDRCxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7WUFDckIsR0FBRyxDQUFDLFNBQVMsR0FBRyxJQUFJLENBQUM7U0FDdEI7YUFBTSxJQUFJLE1BQU0sQ0FBQyxDQUFDLENBQUMsS0FBSyxHQUFHLEVBQUU7WUFDNUIsR0FBRyxDQUFDLFNBQVMsR0FBRyxLQUFLLENBQUM7U0FDdkI7YUFBTTtZQUNMLE1BQU0sSUFBSSxtQkFBZSxDQUFDLDBCQUEwQixDQUFDLENBQUM7U0FDdkQ7UUFDRCxPQUFPLEdBQUcsQ0FBQztJQUNiLENBQUM7SUFFTSxhQUFhLENBQUMsR0FBa0IsRUFBRSxFQUFZLEVBQUUsS0FBYTtRQUNsRSxJQUFJLEtBQUssS0FBSyxHQUFHLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRTtZQUNqQyxHQUFHLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQztTQUN6QjtJQUNILENBQUM7SUFFTSxLQUFLLENBQUMsT0FBTyxDQUFDLEdBQWtCLEVBQUUsTUFBZ0I7UUFDdkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDO1FBQzlCLElBQUksQ0FBQyxLQUFLLEtBQUssUUFBUSxDQUFDLE1BQU0sSUFBSSxNQUFNLEtBQUssUUFBUSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsQ0FBQyxTQUFTLEVBQUU7WUFDOUUsR0FBRyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxXQUFXLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztTQUN2QztJQUNILENBQUM7Q0FDRjtBQWhDRCwwQ0FnQ0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBJSW1hZ2VDb250ZXh0IH0gZnJvbSAnLic7XG5pbXBvcnQgeyBJQWN0aW9uT3B0cywgUmVhZE9ubHksIEludmFsaWRBcmd1bWVudCB9IGZyb20gJy4uJztcbmltcG9ydCB7IEJhc2VJbWFnZUFjdGlvbiB9IGZyb20gJy4vX2Jhc2UnO1xuZXhwb3J0IGludGVyZmFjZSBJbnRlcmxhY2VPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICBpbnRlcmxhY2U6IGJvb2xlYW47XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmxhY2VBY3Rpb24gZXh0ZW5kcyBCYXNlSW1hZ2VBY3Rpb24ge1xuICBwdWJsaWMgcmVhZG9ubHkgbmFtZTogc3RyaW5nID0gJ2ludGVybGFjZSc7XG5cbiAgcHVibGljIHZhbGlkYXRlKHBhcmFtczogc3RyaW5nW10pOiBSZWFkT25seTxJbnRlcmxhY2VPcHRzPiB7XG4gICAgbGV0IG9wdDogSW50ZXJsYWNlT3B0cyA9IHsgaW50ZXJsYWNlOiBmYWxzZSB9O1xuXG4gICAgaWYgKHBhcmFtcy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ0ludGVybGFjZSBwYXJhbSBlcnJvciwgZS5nOiBpbnRlcmxhY2UsMScpO1xuICAgIH1cbiAgICBpZiAocGFyYW1zWzFdID09PSAnMScpIHtcbiAgICAgIG9wdC5pbnRlcmxhY2UgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAocGFyYW1zWzFdID09PSAnMCcpIHtcbiAgICAgIG9wdC5pbnRlcmxhY2UgPSBmYWxzZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnSW50ZXJsYWNlIG11c3QgYmUgMCBvciAxJyk7XG4gICAgfVxuICAgIHJldHVybiBvcHQ7XG4gIH1cblxuICBwdWJsaWMgYmVmb3JlUHJvY2VzcyhjdHg6IElJbWFnZUNvbnRleHQsIF8yOiBzdHJpbmdbXSwgaW5kZXg6IG51bWJlcik6IHZvaWQge1xuICAgIGlmICgnZ2lmJyA9PT0gY3R4Lm1ldGFkYXRhLmZvcm1hdCkge1xuICAgICAgY3R4Lm1hc2suZGlzYWJsZShpbmRleCk7XG4gICAgfVxuICB9XG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJSW1hZ2VDb250ZXh0LCBwYXJhbXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3B0ID0gdGhpcy52YWxpZGF0ZShwYXJhbXMpO1xuICAgIGNvbnN0IG1ldGFkYXRhID0gY3R4Lm1ldGFkYXRhO1xuICAgIGlmICgoJ2pwZycgPT09IG1ldGFkYXRhLmZvcm1hdCB8fCAnanBlZycgPT09IG1ldGFkYXRhLmZvcm1hdCkgJiYgb3B0LmludGVybGFjZSkge1xuICAgICAgY3R4LmltYWdlLmpwZWcoeyBwcm9ncmVzc2l2ZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH1cbn0iXX0=