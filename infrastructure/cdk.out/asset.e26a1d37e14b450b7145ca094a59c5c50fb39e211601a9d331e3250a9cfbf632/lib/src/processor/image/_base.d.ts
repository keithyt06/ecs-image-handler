import { IImageContext } from '.';
import { IAction, IActionOpts, IProcessContext, ReadOnly, IActionMask } from '..';
export declare abstract class BaseImageAction implements IAction {
    name: string;
    abstract validate(params: string[]): ReadOnly<IActionOpts>;
    abstract process(ctx: IProcessContext, params: string[]): Promise<void>;
    beforeNewContext(_1: IProcessContext, params: string[], _3: number): void;
    beforeProcess(_1: IImageContext, _2: string[], _3: number): void;
}
export declare class ActionMask implements IActionMask {
    private readonly _actions;
    private readonly _masks;
    constructor(_actions: string[]);
    get length(): number;
    private _check;
    getAction(index: number): string;
    isEnabled(index: number): boolean;
    isDisabled(index: number): boolean;
    enable(index: number): void;
    disable(index: number): void;
    disableAll(): void;
    filterEnabledActions(): string[];
    forEachAction(cb: (action: string, enabled: boolean, index: number) => void): void;
}
export declare function split1(s: string, sep?: string): string[];
