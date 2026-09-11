/**
 * @scitrera/messaging-spec — TypeScript reference implementation.
 *
 * See ../docs/UNIVERSAL_MESSAGE_SPEC.md for the normative spec.
 */
export * from './schema';
export * from './tools';
export * from './catalog';
export * from './events';
export * from './memorylayer';
export * from './session';
export * from './workspaceExecution';
export {applyEvent, reduceEvents, type MessageState} from './applyEvent';
