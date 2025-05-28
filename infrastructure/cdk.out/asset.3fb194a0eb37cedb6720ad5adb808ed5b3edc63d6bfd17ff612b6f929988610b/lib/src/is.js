"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inArray = exports.integer = exports.number = exports.string = exports.typedArray = exports.buffer = exports.bool = exports.fn = exports.plainObject = exports.object = exports.defined = exports.hexColor = exports.inRange = void 0;
function inRange(val, min, max) {
    return val >= min && val <= max;
}
exports.inRange = inRange;
;
function hexColor(c) {
    const regex = /^#([\da-f]{3}){1,2}$|^#([\da-f]{4}){1,2}$/i;
    return !!(c && regex.test(c));
}
exports.hexColor = hexColor;
function defined(val) {
    return typeof val !== 'undefined' && val !== null;
}
exports.defined = defined;
;
function object(val) {
    return typeof val === 'object';
}
exports.object = object;
;
function plainObject(val) {
    return Object.prototype.toString.call(val) === '[object Object]';
}
exports.plainObject = plainObject;
;
function fn(val) {
    return typeof val === 'function';
}
exports.fn = fn;
;
function bool(val) {
    return typeof val === 'boolean';
}
exports.bool = bool;
;
function buffer(val) {
    return val instanceof Buffer;
}
exports.buffer = buffer;
;
function typedArray(val) {
    if (defined(val)) {
        switch (val.constructor) {
            case Uint8Array:
            case Uint8ClampedArray:
            case Int8Array:
            case Uint16Array:
            case Int16Array:
            case Uint32Array:
            case Int32Array:
            case Float32Array:
            case Float64Array:
                return true;
        }
    }
    return false;
}
exports.typedArray = typedArray;
;
function string(val) {
    return typeof val === 'string' && val.length > 0;
}
exports.string = string;
;
function number(val) {
    return typeof val === 'number' && !Number.isNaN(val);
}
exports.number = number;
;
function integer(val) {
    return Number.isInteger(val);
}
exports.integer = integer;
;
function inArray(val, list) {
    return list.includes(val);
}
exports.inArray = inArray;
;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi9zcmMvaXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQUEsU0FBZ0IsT0FBTyxDQUFDLEdBQVcsRUFBRSxHQUFXLEVBQUUsR0FBVztJQUMzRCxPQUFPLEdBQUcsSUFBSSxHQUFHLElBQUksR0FBRyxJQUFJLEdBQUcsQ0FBQztBQUNsQyxDQUFDO0FBRkQsMEJBRUM7QUFBQSxDQUFDO0FBRUYsU0FBZ0IsUUFBUSxDQUFDLENBQVM7SUFDaEMsTUFBTSxLQUFLLEdBQUcsNENBQTRDLENBQUM7SUFDM0QsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ2hDLENBQUM7QUFIRCw0QkFHQztBQUdELFNBQWdCLE9BQU8sQ0FBQyxHQUFRO0lBQzlCLE9BQU8sT0FBTyxHQUFHLEtBQUssV0FBVyxJQUFJLEdBQUcsS0FBSyxJQUFJLENBQUM7QUFDcEQsQ0FBQztBQUZELDBCQUVDO0FBQUEsQ0FBQztBQUdGLFNBQWdCLE1BQU0sQ0FBQyxHQUFRO0lBQzdCLE9BQU8sT0FBTyxHQUFHLEtBQUssUUFBUSxDQUFDO0FBQ2pDLENBQUM7QUFGRCx3QkFFQztBQUFBLENBQUM7QUFHRixTQUFnQixXQUFXLENBQUMsR0FBUTtJQUNsQyxPQUFPLE1BQU0sQ0FBQyxTQUFTLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsS0FBSyxpQkFBaUIsQ0FBQztBQUNuRSxDQUFDO0FBRkQsa0NBRUM7QUFBQSxDQUFDO0FBR0YsU0FBZ0IsRUFBRSxDQUFDLEdBQVE7SUFDekIsT0FBTyxPQUFPLEdBQUcsS0FBSyxVQUFVLENBQUM7QUFDbkMsQ0FBQztBQUZELGdCQUVDO0FBQUEsQ0FBQztBQUdGLFNBQWdCLElBQUksQ0FBQyxHQUFRO0lBQzNCLE9BQU8sT0FBTyxHQUFHLEtBQUssU0FBUyxDQUFDO0FBQ2xDLENBQUM7QUFGRCxvQkFFQztBQUFBLENBQUM7QUFHRixTQUFnQixNQUFNLENBQUMsR0FBUTtJQUM3QixPQUFPLEdBQUcsWUFBWSxNQUFNLENBQUM7QUFDL0IsQ0FBQztBQUZELHdCQUVDO0FBQUEsQ0FBQztBQUdGLFNBQWdCLFVBQVUsQ0FBQyxHQUFRO0lBQ2pDLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFO1FBQ2hCLFFBQVEsR0FBRyxDQUFDLFdBQVcsRUFBRTtZQUN2QixLQUFLLFVBQVUsQ0FBQztZQUNoQixLQUFLLGlCQUFpQixDQUFDO1lBQ3ZCLEtBQUssU0FBUyxDQUFDO1lBQ2YsS0FBSyxXQUFXLENBQUM7WUFDakIsS0FBSyxVQUFVLENBQUM7WUFDaEIsS0FBSyxXQUFXLENBQUM7WUFDakIsS0FBSyxVQUFVLENBQUM7WUFDaEIsS0FBSyxZQUFZLENBQUM7WUFDbEIsS0FBSyxZQUFZO2dCQUNmLE9BQU8sSUFBSSxDQUFDO1NBQ2Y7S0FDRjtJQUVELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQztBQWpCRCxnQ0FpQkM7QUFBQSxDQUFDO0FBR0YsU0FBZ0IsTUFBTSxDQUFDLEdBQVE7SUFDN0IsT0FBTyxPQUFPLEdBQUcsS0FBSyxRQUFRLElBQUksR0FBRyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7QUFDbkQsQ0FBQztBQUZELHdCQUVDO0FBQUEsQ0FBQztBQUdGLFNBQWdCLE1BQU0sQ0FBQyxHQUFRO0lBQzdCLE9BQU8sT0FBTyxHQUFHLEtBQUssUUFBUSxJQUFJLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQztBQUN2RCxDQUFDO0FBRkQsd0JBRUM7QUFBQSxDQUFDO0FBR0YsU0FBZ0IsT0FBTyxDQUFDLEdBQVE7SUFDOUIsT0FBTyxNQUFNLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQy9CLENBQUM7QUFGRCwwQkFFQztBQUFBLENBQUM7QUFFRixTQUFnQixPQUFPLENBQUMsR0FBUSxFQUFFLElBQVc7SUFDM0MsT0FBTyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDO0FBQzVCLENBQUM7QUFGRCwwQkFFQztBQUFBLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJleHBvcnQgZnVuY3Rpb24gaW5SYW5nZSh2YWw6IG51bWJlciwgbWluOiBudW1iZXIsIG1heDogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiB2YWwgPj0gbWluICYmIHZhbCA8PSBtYXg7XG59O1xuXG5leHBvcnQgZnVuY3Rpb24gaGV4Q29sb3IoYzogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGNvbnN0IHJlZ2V4ID0gL14jKFtcXGRhLWZdezN9KXsxLDJ9JHxeIyhbXFxkYS1mXXs0fSl7MSwyfSQvaTtcbiAgcmV0dXJuICEhKGMgJiYgcmVnZXgudGVzdChjKSk7XG59XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGRlZmluZWQodmFsOiBhbnkpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWwgIT09ICd1bmRlZmluZWQnICYmIHZhbCAhPT0gbnVsbDtcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIG9iamVjdCh2YWw6IGFueSkge1xuICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ29iamVjdCc7XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBwbGFpbk9iamVjdCh2YWw6IGFueSkge1xuICByZXR1cm4gT2JqZWN0LnByb3RvdHlwZS50b1N0cmluZy5jYWxsKHZhbCkgPT09ICdbb2JqZWN0IE9iamVjdF0nO1xufTtcblxuXG5leHBvcnQgZnVuY3Rpb24gZm4odmFsOiBhbnkpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdmdW5jdGlvbic7XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBib29sKHZhbDogYW55KSB7XG4gIHJldHVybiB0eXBlb2YgdmFsID09PSAnYm9vbGVhbic7XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBidWZmZXIodmFsOiBhbnkpIHtcbiAgcmV0dXJuIHZhbCBpbnN0YW5jZW9mIEJ1ZmZlcjtcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHR5cGVkQXJyYXkodmFsOiBhbnkpIHtcbiAgaWYgKGRlZmluZWQodmFsKSkge1xuICAgIHN3aXRjaCAodmFsLmNvbnN0cnVjdG9yKSB7XG4gICAgICBjYXNlIFVpbnQ4QXJyYXk6XG4gICAgICBjYXNlIFVpbnQ4Q2xhbXBlZEFycmF5OlxuICAgICAgY2FzZSBJbnQ4QXJyYXk6XG4gICAgICBjYXNlIFVpbnQxNkFycmF5OlxuICAgICAgY2FzZSBJbnQxNkFycmF5OlxuICAgICAgY2FzZSBVaW50MzJBcnJheTpcbiAgICAgIGNhc2UgSW50MzJBcnJheTpcbiAgICAgIGNhc2UgRmxvYXQzMkFycmF5OlxuICAgICAgY2FzZSBGbG9hdDY0QXJyYXk6XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBmYWxzZTtcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIHN0cmluZyh2YWw6IGFueSkge1xuICByZXR1cm4gdHlwZW9mIHZhbCA9PT0gJ3N0cmluZycgJiYgdmFsLmxlbmd0aCA+IDA7XG59O1xuXG5cbmV4cG9ydCBmdW5jdGlvbiBudW1iZXIodmFsOiBhbnkpIHtcbiAgcmV0dXJuIHR5cGVvZiB2YWwgPT09ICdudW1iZXInICYmICFOdW1iZXIuaXNOYU4odmFsKTtcbn07XG5cblxuZXhwb3J0IGZ1bmN0aW9uIGludGVnZXIodmFsOiBhbnkpIHtcbiAgcmV0dXJuIE51bWJlci5pc0ludGVnZXIodmFsKTtcbn07XG5cbmV4cG9ydCBmdW5jdGlvbiBpbkFycmF5KHZhbDogYW55LCBsaXN0OiBhbnlbXSkge1xuICByZXR1cm4gbGlzdC5pbmNsdWRlcyh2YWwpO1xufTsiXX0=