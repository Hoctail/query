export = Client;
import {ClientOptions, LoggerFunction, EventMessage, EventCallback, Tx, UserProfile} from "./src/HClient";

declare const HClient: typeof import("./src/HClient");

declare class Client extends HClient {
    constructor(options: ClientOptions, logger?: LoggerFunction);
}

declare namespace Client {
    export {Client as default, ClientOptions, LoggerFunction, EventMessage, EventCallback, Tx, UserProfile};
}
