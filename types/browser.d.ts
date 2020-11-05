export default Client;
import {ClientOptions, LoggerFunction, EventMessage, EventCallback, UserProfile} from "./src/HClient";

declare const HClient: typeof import("./src/HClient");

declare class Client extends HClient {
    constructor(options: ClientOptions, logger?: LoggerFunction);

    liveReload(): void;

    static parseApp(): string;
}

declare namespace Client {
    export {Client as default, ClientOptions, LoggerFunction, EventMessage, EventCallback, UserProfile};
}
