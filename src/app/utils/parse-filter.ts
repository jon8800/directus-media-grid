import { useStores } from '@directus/extensions-sdk';
import { Accountability } from '@directus/shared/types';
import { parseFilter as parseFilterShared } from '@directus/shared/utils';
import { Filter } from '@directus/shared/types';

export function parseFilter(filter: Filter | null): Filter {
	const { useUserStore } = useStores();
	const userStore = useUserStore();

	if (!userStore.currentUser) return filter ?? {};

	const accountability: Accountability = {
		role: userStore.currentUser.role.id,
		user: userStore.currentUser.id,
	};

	return parseFilterShared(filter, accountability) ?? {};
}
