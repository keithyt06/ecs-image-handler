"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StripMetadataAction = void 0;
const _base_1 = require("./_base");
class StripMetadataAction extends _base_1.BaseImageAction {
    constructor() {
        super(...arguments);
        this.name = 'strip-metadata';
    }
    validate(_) {
        return {};
    }
    process(_1, _2) {
        return Promise.resolve();
    }
}
exports.StripMetadataAction = StripMetadataAction;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXAtbWV0YWRhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9zcmMvcHJvY2Vzc29yL2ltYWdlL3N0cmlwLW1ldGFkYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLG1DQUEwQztBQUUxQyxNQUFhLG1CQUFvQixTQUFRLHVCQUFlO0lBQXhEOztRQUNrQixTQUFJLEdBQVcsZ0JBQWdCLENBQUM7SUFRbEQsQ0FBQztJQU5DLFFBQVEsQ0FBQyxDQUFXO1FBQ2xCLE9BQU8sRUFBRSxDQUFDO0lBQ1osQ0FBQztJQUNELE9BQU8sQ0FBQyxFQUFtQixFQUFFLEVBQVk7UUFDdkMsT0FBTyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDM0IsQ0FBQztDQUNGO0FBVEQsa0RBU0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBSZWFkT25seSwgSUFjdGlvbk9wdHMsIElQcm9jZXNzQ29udGV4dCB9IGZyb20gJy4uJztcbmltcG9ydCB7IEJhc2VJbWFnZUFjdGlvbiB9IGZyb20gJy4vX2Jhc2UnO1xuXG5leHBvcnQgY2xhc3MgU3RyaXBNZXRhZGF0YUFjdGlvbiBleHRlbmRzIEJhc2VJbWFnZUFjdGlvbiB7XG4gIHB1YmxpYyByZWFkb25seSBuYW1lOiBzdHJpbmcgPSAnc3RyaXAtbWV0YWRhdGEnO1xuXG4gIHZhbGlkYXRlKF86IHN0cmluZ1tdKTogUmVhZE9ubHk8SUFjdGlvbk9wdHM+IHtcbiAgICByZXR1cm4ge307XG4gIH1cbiAgcHJvY2VzcyhfMTogSVByb2Nlc3NDb250ZXh0LCBfMjogc3RyaW5nW10pOiBQcm9taXNlPHZvaWQ+IHtcbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gIH1cbn0iXX0=