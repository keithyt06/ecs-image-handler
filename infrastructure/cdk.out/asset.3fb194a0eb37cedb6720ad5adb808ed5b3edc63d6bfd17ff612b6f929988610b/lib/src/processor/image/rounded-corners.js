"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoundedCornersAction = void 0;
const sharp = require("sharp");
const __1 = require("..");
const is = require("../../is");
const _base_1 = require("./_base");
class RoundedCornersAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'rounded-corners';
    }
    validate(params) {
        let opt = { r: 1 };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('RoundedCorners param error, e.g: rounded-corners,r_30');
        }
        for (const param of params) {
            if ((this.name === param) || (!param)) {
                continue;
            }
            const [k, v] = param.split('_');
            if (k === 'r') {
                const r = Number.parseInt(v, 10);
                if (is.inRange(r, 1, 4096)) {
                    opt.r = r;
                }
                else {
                    throw new __1.InvalidArgument('RoundedCorners param \'r\' must be between 1 and 4096');
                }
            }
            else {
                throw new __1.InvalidArgument(`Unkown param: "${k}"`);
            }
        }
        return opt;
    }
    async process(ctx, params) {
        var _a;
        const opt = this.validate(params);
        const metadata = await sharp(await ctx.image.toBuffer()).metadata(); // https://github.com/lovell/sharp/issues/2959
        if (!(metadata.width && metadata.height)) {
            throw new __1.InvalidArgument('Can\'t read image\'s width and height');
        }
        const w = metadata.width;
        const h = metadata.height;
        const pages = (_a = metadata.pages) !== null && _a !== void 0 ? _a : 1;
        const rects = Array.from({ length: pages }, (_, i) => `<rect y="${i * h}" width="${w}" height="${h}" rx="${opt.r}" />`);
        const mask = Buffer.from(`<svg viewBox="0 0 ${w} ${pages * h}">
      ${rects.join('\n')}
    </svg>`);
        ctx.image.composite([
            { input: mask, blend: 'dest-in' },
        ]);
    }
}
exports.RoundedCornersAction = RoundedCornersAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm91bmRlZC1jb3JuZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci9pbWFnZS9yb3VuZGVkLWNvcm5lcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQStCO0FBRS9CLDBCQUE0RDtBQUM1RCwrQkFBK0I7QUFDL0IsbUNBQTBDO0FBTTFDLE1BQWEsb0JBQXFCLFNBQVEsdUJBQWU7SUFBekQ7O1FBQ2tCLFNBQUksR0FBVyxpQkFBaUIsQ0FBQztJQW1EbkQsQ0FBQztJQWpEUSxRQUFRLENBQUMsTUFBZ0I7UUFDOUIsSUFBSSxHQUFHLEdBQXVCLEVBQUUsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDO1FBRXZDLElBQUksTUFBTSxDQUFDLE1BQU0sS0FBSyxDQUFDLEVBQUU7WUFDdkIsTUFBTSxJQUFJLG1CQUFlLENBQUMsdURBQXVELENBQUMsQ0FBQztTQUNwRjtRQUVELEtBQUssTUFBTSxLQUFLLElBQUksTUFBTSxFQUFFO1lBQzFCLElBQUksQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsRUFBRTtnQkFDckMsU0FBUzthQUNWO1lBQ0QsTUFBTSxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsR0FBRyxLQUFLLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ2hDLElBQUksQ0FBQyxLQUFLLEdBQUcsRUFBRTtnQkFDYixNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDakMsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLENBQUMsRUFBRSxDQUFDLEVBQUUsSUFBSSxDQUFDLEVBQUU7b0JBQzFCLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDO2lCQUNYO3FCQUFNO29CQUNMLE1BQU0sSUFBSSxtQkFBZSxDQUFDLHVEQUF1RCxDQUFDLENBQUM7aUJBQ3BGO2FBQ0Y7aUJBQU07Z0JBQ0wsTUFBTSxJQUFJLG1CQUFlLENBQUMsa0JBQWtCLENBQUMsR0FBRyxDQUFDLENBQUM7YUFDbkQ7U0FDRjtRQUVELE9BQU8sR0FBRyxDQUFDO0lBQ2IsQ0FBQztJQUdNLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBa0IsRUFBRSxNQUFnQjs7UUFDdkQsTUFBTSxHQUFHLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNsQyxNQUFNLFFBQVEsR0FBRyxNQUFNLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLDhDQUE4QztRQUNuSCxJQUFJLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxJQUFJLFFBQVEsQ0FBQyxNQUFNLENBQUMsRUFBRTtZQUN4QyxNQUFNLElBQUksbUJBQWUsQ0FBQyx1Q0FBdUMsQ0FBQyxDQUFDO1NBQ3BFO1FBRUQsTUFBTSxDQUFDLEdBQUcsUUFBUSxDQUFDLEtBQUssQ0FBQztRQUN6QixNQUFNLENBQUMsR0FBRyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQzFCLE1BQU0sS0FBSyxHQUFHLE1BQUEsUUFBUSxDQUFDLEtBQUssbUNBQUksQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sS0FBSyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxFQUFFLEVBQUUsQ0FDbkQsWUFBWSxDQUFDLEdBQUcsQ0FBQyxZQUFZLENBQUMsYUFBYSxDQUFDLFNBQVMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUNqRSxDQUFDO1FBQ0YsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLElBQUksQ0FBQyxxQkFBcUIsQ0FBQyxJQUFJLEtBQUssR0FBRyxDQUFDO1FBQ3hELEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDO1dBQ2IsQ0FBQyxDQUFDO1FBRVQsR0FBRyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUM7WUFDbEIsRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUU7U0FDbEMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBcERELG9EQW9EQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIHNoYXJwIGZyb20gJ3NoYXJwJztcbmltcG9ydCB7IElJbWFnZUNvbnRleHQgfSBmcm9tICcuJztcbmltcG9ydCB7IElBY3Rpb25PcHRzLCBSZWFkT25seSwgSW52YWxpZEFyZ3VtZW50IH0gZnJvbSAnLi4nO1xuaW1wb3J0ICogYXMgaXMgZnJvbSAnLi4vLi4vaXMnO1xuaW1wb3J0IHsgQmFzZUltYWdlQWN0aW9uIH0gZnJvbSAnLi9fYmFzZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUm91bmRlZENvcm5lcnNPcHRzIGV4dGVuZHMgSUFjdGlvbk9wdHMge1xuICByOiBudW1iZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBSb3VuZGVkQ29ybmVyc0FjdGlvbiBleHRlbmRzIEJhc2VJbWFnZUFjdGlvbiB7XG4gIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcgPSAncm91bmRlZC1jb3JuZXJzJztcblxuICBwdWJsaWMgdmFsaWRhdGUocGFyYW1zOiBzdHJpbmdbXSk6IFJlYWRPbmx5PFJvdW5kZWRDb3JuZXJzT3B0cz4ge1xuICAgIGxldCBvcHQ6IFJvdW5kZWRDb3JuZXJzT3B0cyA9IHsgcjogMSB9O1xuXG4gICAgaWYgKHBhcmFtcy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1JvdW5kZWRDb3JuZXJzIHBhcmFtIGVycm9yLCBlLmc6IHJvdW5kZWQtY29ybmVycyxyXzMwJyk7XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBwYXJhbSBvZiBwYXJhbXMpIHtcbiAgICAgIGlmICgodGhpcy5uYW1lID09PSBwYXJhbSkgfHwgKCFwYXJhbSkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBbaywgdl0gPSBwYXJhbS5zcGxpdCgnXycpO1xuICAgICAgaWYgKGsgPT09ICdyJykge1xuICAgICAgICBjb25zdCByID0gTnVtYmVyLnBhcnNlSW50KHYsIDEwKTtcbiAgICAgICAgaWYgKGlzLmluUmFuZ2UociwgMSwgNDA5NikpIHtcbiAgICAgICAgICBvcHQuciA9IHI7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnUm91bmRlZENvcm5lcnMgcGFyYW0gXFwnclxcJyBtdXN0IGJlIGJldHdlZW4gMSBhbmQgNDA5NicpO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KGBVbmtvd24gcGFyYW06IFwiJHtrfVwiYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuXG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJSW1hZ2VDb250ZXh0LCBwYXJhbXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3B0ID0gdGhpcy52YWxpZGF0ZShwYXJhbXMpO1xuICAgIGNvbnN0IG1ldGFkYXRhID0gYXdhaXQgc2hhcnAoYXdhaXQgY3R4LmltYWdlLnRvQnVmZmVyKCkpLm1ldGFkYXRhKCk7IC8vIGh0dHBzOi8vZ2l0aHViLmNvbS9sb3ZlbGwvc2hhcnAvaXNzdWVzLzI5NTlcbiAgICBpZiAoIShtZXRhZGF0YS53aWR0aCAmJiBtZXRhZGF0YS5oZWlnaHQpKSB7XG4gICAgICB0aHJvdyBuZXcgSW52YWxpZEFyZ3VtZW50KCdDYW5cXCd0IHJlYWQgaW1hZ2VcXCdzIHdpZHRoIGFuZCBoZWlnaHQnKTtcbiAgICB9XG5cbiAgICBjb25zdCB3ID0gbWV0YWRhdGEud2lkdGg7XG4gICAgY29uc3QgaCA9IG1ldGFkYXRhLmhlaWdodDtcbiAgICBjb25zdCBwYWdlcyA9IG1ldGFkYXRhLnBhZ2VzID8/IDE7XG4gICAgY29uc3QgcmVjdHMgPSBBcnJheS5mcm9tKHsgbGVuZ3RoOiBwYWdlcyB9LCAoXywgaSkgPT5cbiAgICAgIGA8cmVjdCB5PVwiJHtpICogaH1cIiB3aWR0aD1cIiR7d31cIiBoZWlnaHQ9XCIke2h9XCIgcng9XCIke29wdC5yfVwiIC8+YCxcbiAgICApO1xuICAgIGNvbnN0IG1hc2sgPSBCdWZmZXIuZnJvbShgPHN2ZyB2aWV3Qm94PVwiMCAwICR7d30gJHtwYWdlcyAqIGh9XCI+XG4gICAgICAke3JlY3RzLmpvaW4oJ1xcbicpfVxuICAgIDwvc3ZnPmApO1xuXG4gICAgY3R4LmltYWdlLmNvbXBvc2l0ZShbXG4gICAgICB7IGlucHV0OiBtYXNrLCBibGVuZDogJ2Rlc3QtaW4nIH0sXG4gICAgXSk7XG4gIH1cbn0iXX0=