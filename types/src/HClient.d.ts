export = HClient;

declare class HClient {
    constructor(options: ClientOptions, logger?: LoggerFunction);

    baseURL: string;
    logger: LoggerFunction | null;
    schema: string | null;
    token: string | null;

    set app(arg: string);
    get app(): string;

    call(endpoint: string, ...args: any[]): Promise<any>;

    connect(): Promise<void>;

    eventListener(callback: EventCallback): void;

    q: typeof HClient.prototype.query;

    query(query: string, params?: Array<any>, wait?: boolean): Promise<object[]>;

    run(func: Function, ...args: any[]): Promise<void>;

    terminate(code?: number, reason?: string): void;

    tx(func?: Function): Promise<Tx | any>;

    user(): Promise<UserProfile>;

    wait(func: Function | string, ...args: any[]): Promise<any>;

    get closed(): boolean;
}

declare namespace HClient {
    export {HClient as default, ClientOptions, LoggerFunction, EventMessage, EventCallback, Tx, UserProfile};
}
type LoggerFunction = (...args: any[]) => void;

declare class Tx {
    readonly tid: string | null;

    call(endpoint: string, ...args: any[]): Promise<any>;

    commit(): Promise<void>;

    query(query: string, params?: Array<any>): Promise<object[]>;

    rollback(): Promise<void>;

    run(func: Function, ...args: any[]): Promise<void>;
}

type EventCallback = (message: EventMessage) => void;
type ClientOptions = {
    baseURL: string;
    schema?: string;
    token?: string;
    app?: string;
    key?: string;
    logLevel?: number;
};
type EventMessage = {
    eventId: string;
    schema: string;
    relation: string;
    ids: string[];
};
type UserProfile = {
    [key: string]: any;
    username: string;
    firstname: string;
    lastname: string;
    email: string;
}
