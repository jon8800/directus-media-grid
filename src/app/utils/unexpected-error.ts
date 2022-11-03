import { useStores } from '@directus/extensions-sdk';
import { APIError, RequestError } from '../types';

let store: any;

export function unexpectedError(error: Error | RequestError | APIError): void {
	const { useNotificationsStore } = useStores();

	if (!store) store = useNotificationsStore();

	const code =
		(error as RequestError).response?.data?.errors?.[0]?.extensions?.code ||
		(error as APIError)?.extensions?.code ||
		'UNKNOWN';

	// eslint-disable-next-line no-console
	console.warn(error);

	store.add({
		title: `errors.${code}`,
		type: 'error',
		dialog: true,
		error,
	});
}
