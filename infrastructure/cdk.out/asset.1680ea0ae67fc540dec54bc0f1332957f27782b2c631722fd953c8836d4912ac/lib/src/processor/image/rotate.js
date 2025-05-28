"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RotateAction = void 0;
const sharp = require("sharp");
const __1 = require("..");
const is = require("../../is");
const _base_1 = require("./_base");
class RotateAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'rotate';
    }
    validate(params) {
        let opt = { degree: 0 };
        if (params.length !== 2) {
            throw new __1.InvalidArgument('Rotate param error, e.g: rotate,90');
        }
        const d = Number.parseInt(params[1], 10);
        if (is.inRange(d, 0, 360)) {
            opt.degree = d;
        }
        else {
            throw new __1.InvalidArgument('Rotate must be between 0 and 360');
        }
        return opt;
    }
    async process(ctx, params) {
        const opt = this.validate(params);
        ctx.image = sharp(await ctx.image.toBuffer()).rotate(opt.degree, {
            background: '#ffffff',
        });
    }
}
exports.RotateAction = RotateAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicm90YXRlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vc3JjL3Byb2Nlc3Nvci9pbWFnZS9yb3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsK0JBQStCO0FBRS9CLDBCQUE0RDtBQUM1RCwrQkFBK0I7QUFDL0IsbUNBQTBDO0FBTTFDLE1BQWEsWUFBYSxTQUFRLHVCQUFlO0lBQWpEOztRQUNrQixTQUFJLEdBQVcsUUFBUSxDQUFDO0lBd0IxQyxDQUFDO0lBdEJRLFFBQVEsQ0FBQyxNQUFnQjtRQUM5QixJQUFJLEdBQUcsR0FBZSxFQUFFLE1BQU0sRUFBRSxDQUFDLEVBQUUsQ0FBQztRQUVwQyxJQUFJLE1BQU0sQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxtQkFBZSxDQUFDLG9DQUFvQyxDQUFDLENBQUM7U0FDakU7UUFDRCxNQUFNLENBQUMsR0FBRyxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztRQUN6QyxJQUFJLEVBQUUsQ0FBQyxPQUFPLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxHQUFHLENBQUMsRUFBRTtZQUN6QixHQUFHLENBQUMsTUFBTSxHQUFHLENBQUMsQ0FBQztTQUNoQjthQUFNO1lBQ0wsTUFBTSxJQUFJLG1CQUFlLENBQUMsa0NBQWtDLENBQUMsQ0FBQztTQUMvRDtRQUNELE9BQU8sR0FBRyxDQUFDO0lBQ2IsQ0FBQztJQUdNLEtBQUssQ0FBQyxPQUFPLENBQUMsR0FBa0IsRUFBRSxNQUFnQjtRQUN2RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ2xDLEdBQUcsQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLEtBQUssQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxHQUFHLENBQUMsTUFBTSxFQUFFO1lBQy9ELFVBQVUsRUFBRSxTQUFTO1NBQ3RCLENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpCRCxvQ0F5QkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBzaGFycCBmcm9tICdzaGFycCc7XG5pbXBvcnQgeyBJSW1hZ2VDb250ZXh0IH0gZnJvbSAnLic7XG5pbXBvcnQgeyBJQWN0aW9uT3B0cywgUmVhZE9ubHksIEludmFsaWRBcmd1bWVudCB9IGZyb20gJy4uJztcbmltcG9ydCAqIGFzIGlzIGZyb20gJy4uLy4uL2lzJztcbmltcG9ydCB7IEJhc2VJbWFnZUFjdGlvbiB9IGZyb20gJy4vX2Jhc2UnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFJvdGF0ZU9wdHMgZXh0ZW5kcyBJQWN0aW9uT3B0cyB7XG4gIGRlZ3JlZTogbnVtYmVyO1xufVxuXG5leHBvcnQgY2xhc3MgUm90YXRlQWN0aW9uIGV4dGVuZHMgQmFzZUltYWdlQWN0aW9uIHtcbiAgcHVibGljIHJlYWRvbmx5IG5hbWU6IHN0cmluZyA9ICdyb3RhdGUnO1xuXG4gIHB1YmxpYyB2YWxpZGF0ZShwYXJhbXM6IHN0cmluZ1tdKTogUmVhZE9ubHk8Um90YXRlT3B0cz4ge1xuICAgIGxldCBvcHQ6IFJvdGF0ZU9wdHMgPSB7IGRlZ3JlZTogMCB9O1xuXG4gICAgaWYgKHBhcmFtcy5sZW5ndGggIT09IDIpIHtcbiAgICAgIHRocm93IG5ldyBJbnZhbGlkQXJndW1lbnQoJ1JvdGF0ZSBwYXJhbSBlcnJvciwgZS5nOiByb3RhdGUsOTAnKTtcbiAgICB9XG4gICAgY29uc3QgZCA9IE51bWJlci5wYXJzZUludChwYXJhbXNbMV0sIDEwKTtcbiAgICBpZiAoaXMuaW5SYW5nZShkLCAwLCAzNjApKSB7XG4gICAgICBvcHQuZGVncmVlID0gZDtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEludmFsaWRBcmd1bWVudCgnUm90YXRlIG11c3QgYmUgYmV0d2VlbiAwIGFuZCAzNjAnKTtcbiAgICB9XG4gICAgcmV0dXJuIG9wdDtcbiAgfVxuXG5cbiAgcHVibGljIGFzeW5jIHByb2Nlc3MoY3R4OiBJSW1hZ2VDb250ZXh0LCBwYXJhbXM6IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgb3B0ID0gdGhpcy52YWxpZGF0ZShwYXJhbXMpO1xuICAgIGN0eC5pbWFnZSA9IHNoYXJwKGF3YWl0IGN0eC5pbWFnZS50b0J1ZmZlcigpKS5yb3RhdGUob3B0LmRlZ3JlZSwge1xuICAgICAgYmFja2dyb3VuZDogJyNmZmZmZmYnLFxuICAgIH0pO1xuICB9XG59Il19