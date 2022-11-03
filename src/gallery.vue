<template>
	<v-notice v-if="!relationInfo" type="warning">{{ t('relationship_not_setup') }}</v-notice>
	<div v-else class="many-to-many" ref="galleryEl">
		<template v-if="loading" class="gallery-list">
			<div class="v-list-inner">
				<v-skeleton-gallery-loader v-for="n in clamp(totalItemCount - (page - 1) * limit, 1, limit)" :key="n" />
			</div>
		</template>

		<v-notice v-else-if="displayItems.length === 0">{{ t('no_items') }}</v-notice>

		<v-list v-else class="gallery-list">
			<draggable :force-fallback="true" :model-value="displayItems" item-key="id" handle=".drag-handle"
				:disabled="!allowDrag" @update:model-value="sortItems($event)" class="v-list-inner" :animation="200">
				<template #item="{ element }">
					<v-list-item :class="{ deleted: element.$type === 'deleted' }" block clickable
						:style="{ 'grid-column': `span ${element?.column_width || 1}` }">
						<div class="gallery-item-resizer"
							@pointerdown.self="(e) => onResizeHandlePointerDown(e, element)"></div>

						<div class="v-list-item-wrapper" @click="editItem(element)">
							<div class="v-list-item-header">
								<v-icon v-if="allowDrag" name="drag_handle" class="drag-handle" left
									@click.stop="() => { }" />

								<div class="v-list-item-header-actions">
									<v-icon v-if="!disabled" :name="getDeselectIcon(element)" class="deselect"
										@click.stop="deleteItem(element)" />
									<v-menu show-arrow placement="bottom-end">
										<template #activator="{ toggle }">
											<v-icon name="more_vert" clickable @click.stop="toggle" />
										</template>

										<v-list>
											<v-list-item clickable :href="getUrl(element)">
												<v-list-item-icon>
													<v-icon name="launch" />
												</v-list-item-icon>
												<v-list-item-content>{{ t('open_file_in_tab') }}</v-list-item-content>
											</v-list-item>
											<v-list-item clickable :href="getUrl(element, true)">
												<v-list-item-icon>
													<v-icon name="download" />
												</v-list-item-icon>
												<v-list-item-content>{{ t('download_file') }}</v-list-item-content>
											</v-list-item>
										</v-list>
									</v-menu>
								</div>
							</div>
							<div class="image-preview"
								:class="{ 'is-svg': element.type && element.type.includes('svg') }">
								<v-image :src="getUrl(element)" :width="element.width" :height="element.height" alt=""
									role="presentation" />
								<div class="shadow" />
							</div>
							<render-template :collection="relationInfo.junctionCollection.collection" :item="element"
								:template="templateWithDefaults" />
						</div>
					</v-list-item>
				</template>
			</draggable>
			<div class="gallery-guides">
				<div class="gallery-guide-item" v-for="n in 24" :key="n" />
			</div>
		</v-list>

		<div class="actions">
			<v-button v-if="enableCreate && createAllowed" :disabled="disabled" @click="showUpload = true">
				{{ t('upload_file') }}
			</v-button>
			<v-button v-if="enableSelect && selectAllowed" :disabled="disabled" @click="selectModalActive = true">
				{{ t('add_existing') }}
			</v-button>
			<v-pagination v-if="pageCount > 1" v-model="page" :length="pageCount" :total-visible="5" />
		</div>

		<drawer-item :disabled="disabled" :active="editModalActive"
			:collection="relationInfo.junctionCollection.collection" :primary-key="currentlyEditing || '+'"
			:related-primary-key="relatedPrimaryKey || '+'" :junction-field="relationInfo.junctionField.field"
			:edits="editsAtStart" :circular-field="relationInfo.reverseJunctionField.field" @input="update"
			@update:active="cancelEdit">
			<template #actions>
				<v-button
					v-if="currentlyEditing !== '+' && relationInfo.relatedCollection.collection === 'directus_files'"
					secondary rounded icon download :href="downloadUrl">
					<v-icon name="download" />
				</v-button>
			</template>
		</drawer-item>

		<drawer-collection v-if="!disabled" v-model:active="selectModalActive"
			:collection="relationInfo.relatedCollection.collection" :selection="selectedPrimaryKeys"
			:filter="customFilter" multiple @input="select" />

		<v-dialog v-if="!disabled" v-model="showUpload">
			<v-card>
				<v-card-title>{{ t('upload_file') }}</v-card-title>
				<v-card-text>
					<v-upload multiple from-url :folder="folder" @input="onUpload" />
				</v-card-text>
				<v-card-actions>
					<v-button @click="showUpload = false">{{ t('done') }}</v-button>
				</v-card-actions>
			</v-card>
		</v-dialog>
	</div>
</template>

<script setup lang="ts">
import { useRelationM2M } from './app/composables/use-relation-m2m';
import { useRelationMultiple, RelationQueryMultiple, DisplayItem } from './app/composables/use-relation-multiple';
import { computed, ref, toRefs } from 'vue';
import { useI18n } from 'vue-i18n';
import DrawerItem from './app/views/drawer-item.vue';
import DrawerCollection from './app/views/drawer-collection.vue';
import Draggable from 'vuedraggable';
import { adjustFieldsForDisplays } from './app/utils/adjust-fields-for-displays';
import { get, clamp } from 'lodash';
import { useStores } from '@directus/extensions-sdk';
import { addTokenToURL } from './app/utils/add-token-to-url';
import { getRootPath } from './app/utils/get-root-path';
import { getFieldsFromTemplate } from '@directus/shared/utils';
import { useEventListener } from './app/composables/use-event-listener';
import { Filter } from '@directus/shared/types';
import VSkeletonGalleryLoader from './app/components/v-skeleton-gallery-loader.vue';

const props = withDefaults(
	defineProps<{
		value?: (number | string | Record<string, any>)[] | Record<string, any>;
		primaryKey: string | number;
		collection: string;
		field: string;
		template?: string | null;
		disabled?: boolean;
		enableCreate?: boolean;
		enableSelect?: boolean;
		folder?: string;
		limit?: number;
	}>(),
	{
		value: () => [],
		template: () => null,
		disabled: false,
		enableCreate: true,
		enableSelect: true,
		folder: undefined,
		limit: 15,
	}
);

const emit = defineEmits(['input']);
const { t } = useI18n();
const { collection, field, primaryKey, limit } = toRefs(props);
const { relationInfo } = useRelationM2M(collection, field);

const value = computed({
	get: () => props.value,
	set: (val) => {
		emit('input', val);
	},
});

const templateWithDefaults = computed(() => {
	if (!relationInfo.value) return null;

	if (props.template) return props.template;
	if (relationInfo.value.junctionCollection.meta?.display_template)
		return relationInfo.value.junctionCollection.meta?.display_template;

	let relatedDisplayTemplate = relationInfo.value.relatedCollection.meta?.display_template;
	if (relatedDisplayTemplate) {
		const regex = /({{.*?}})/g;
		const parts = relatedDisplayTemplate.split(regex).filter((p) => p);

		for (const part of parts) {
			if (part.startsWith('{{') === false) continue;
			const key = part.replace(/{{/g, '').replace(/}}/g, '').trim();
			const newPart = `{{${relationInfo.value.relation.field}.${key}}}`;

			relatedDisplayTemplate = relatedDisplayTemplate.replace(part, newPart);
		}

		return relatedDisplayTemplate;
	}

	return `{{${relationInfo.value.relation.field}.${relationInfo.value.relatedPrimaryKeyField.field}}}`;
});

const fields = computed(() =>
	adjustFieldsForDisplays(
		getFieldsFromTemplate(templateWithDefaults.value),
		relationInfo.value?.junctionCollection.collection ?? ''
	)
);

const page = ref(1);

const query = computed<RelationQueryMultiple>(() => ({
	fields: [...fields.value, 'directus_files_id.width', 'directus_files_id.height', 'column_width'],
	limit: limit.value,
	page: page.value,
}));

const { create, update, remove, select, displayItems, totalItemCount, loading, selected, isItemSelected, localDelete } =
	useRelationMultiple(value, query, relationInfo, primaryKey);

const pageCount = computed(() => Math.ceil(totalItemCount.value / limit.value));

const allowDrag = computed(
	() => totalItemCount.value <= limit.value && relationInfo.value?.sortField !== undefined && !props.disabled
);

function getDeselectIcon(item: DisplayItem) {
	if (item.$type === 'deleted') return 'settings_backup_restore';
	if (localDelete(item)) return 'delete';
	return 'close';
}

function sortItems(items: DisplayItem[]) {
	const sortField = relationInfo.value?.sortField;
	if (!sortField) return;

	const sortedItems = items.map((item, index) => ({
		...item,
		[sortField]: index,
	}));
	update(...sortedItems);
}

const galleryEl = ref<HTMLElement>();
const galleryItemEl = ref<HTMLElement>();

const { onResizeHandlePointerDown, onPointerMove, onPointerUp } = useModuleNavResize();
useEventListener(window, 'pointermove', onPointerMove);
useEventListener(window, 'pointerup', onPointerUp);


function useModuleNavResize() {
	const dragging = ref<boolean>(false);
	const dragStartX = ref<number>(0);
	const dragStartWidth = ref<number>(0);
	const currentWidth = ref<number | null>(null);
	const rafId = ref<number | null>(null);
	const columnWidth = ref<number | null>(null);
	const currentIndex = ref<number | null>(null);

	return { onResizeHandlePointerDown, onPointerMove, onPointerUp };

	function onResizeHandlePointerDown(event: PointerEvent, item: DisplayItem) {
		currentIndex.value = item?.files_sort;
		galleryItemEl.value = (event.target as Node).parentElement
		dragging.value = true;
		dragStartX.value = event.pageX;
		dragStartWidth.value = galleryItemEl.value!.offsetWidth;
		galleryItemEl.value.classList.add('resizing');
		galleryEl.value.classList.add('resizing');
	}

	function onPointerMove(event: PointerEvent) {
		if (!dragging.value) return;

		rafId.value = window.requestAnimationFrame(() => {
			columnWidth.value = Math.ceil(6 / (galleryEl.value.offsetWidth / currentWidth.value));
			// Cap the column width to the 6 column grid
			if (columnWidth.value > 6) {
				columnWidth.value = 6;
			}
			currentWidth.value = dragStartWidth.value + (event.pageX - dragStartX.value);
			// Cap the width to the container width
			if (currentWidth.value > galleryEl.value.offsetWidth) {
				currentWidth.value = galleryEl.value.offsetWidth;
			}
			galleryItemEl.value!.style.width = `${currentWidth.value}px`;
		});
	}

	function onPointerUp() {
		if (dragging.value !== true) return;
		dragging.value = false;
		if (rafId.value) {
			window.cancelAnimationFrame(rafId.value);
		}
		galleryItemEl.value!.style.width = "auto";
		galleryItemEl.value!.classList.remove('resizing');
		galleryEl.value!.classList.remove('resizing');
		displayItems.value[currentIndex.value].column_width = columnWidth.value;
		// Save to DB
		saveGalleryItemWidth(displayItems.value);
	}

	function saveGalleryItemWidth(items: DisplayItem[]) {
		const updatedItems = items.map(item => ({
			...item,
			['column_width']: item?.column_width || 0,
		}));
		update(...updatedItems);
	}
}

const selectedPrimaryKeys = computed(() => {
	if (!relationInfo.value) return [];
	const junctionField = relationInfo.value.junctionField.field;
	const relationPkField = relationInfo.value.relatedPrimaryKeyField.field;

	return selected.value.map((item) => item[junctionField][relationPkField]);
});

const editModalActive = ref(false);
const currentlyEditing = ref<string | number | null>(null);
const relatedPrimaryKey = ref<string | number | null>(null);
const selectModalActive = ref(false);
const editsAtStart = ref<Record<string, any>>({});

function editItem(item: DisplayItem) {
	if (!relationInfo.value) return;

	const relationPkField = relationInfo.value.relatedPrimaryKeyField.field;
	const junctionPkField = relationInfo.value.junctionPrimaryKeyField.field;

	editsAtStart.value = item;

	editModalActive.value = true;

	if (item?.$type === 'created' && !isItemSelected(item)) {
		currentlyEditing.value = null;
		relatedPrimaryKey.value = null;
	} else {
		currentlyEditing.value = get(item, [junctionPkField], null);
		relatedPrimaryKey.value = get(item, [junctionPkField, relationPkField], null);
	}
}

function cancelEdit() {
	editModalActive.value = false;
}

function deleteItem(item: DisplayItem) {
	if (
		page.value === Math.ceil(totalItemCount.value / limit.value) &&
		page.value !== Math.ceil((totalItemCount.value - 1) / limit.value)
	) {
		page.value = Math.max(1, page.value - 1);
	}

	remove(item);
}

const showUpload = ref(false);

function onUpload(files: Record<string, any>[]) {
	showUpload.value = false;
	if (files.length === 0 || !relationInfo.value) return;
	const junctionField = relationInfo.value.junctionField.field;
	const reverseJunctionField = relationInfo.value.reverseJunctionField.field;
	const relatedPKField = relationInfo.value.relatedPrimaryKeyField.field;

	const filesAsJunctionRows = files.map((file) => {
		return {
			[reverseJunctionField]: primaryKey.value,
			[junctionField]: {
				[relatedPKField]: file.id,
			},
		};
	});

	create(...filesAsJunctionRows);
}

const downloadUrl = computed(() => {
	if (relatedPrimaryKey.value === null || relationInfo.value?.relatedCollection.collection !== 'directus_files') return;
	return addTokenToURL(getRootPath() + `assets/${relatedPrimaryKey.value}`);
});

function getUrl(junctionRow: Record<string, any>, addDownload?: boolean) {
	const junctionField = relationInfo.value?.junctionField.field;
	if (!junctionField) return;

	const key = junctionRow[junctionField]?.id ?? junctionRow[junctionField] ?? null;
	if (!key) return null;

	if (addDownload) {
		return addTokenToURL(getRootPath() + `assets/${key}?download`);
	}

	return addTokenToURL(getRootPath() + `assets/${key}`);
}

const customFilter = computed(() => {
	const filter: Filter = {
		_and: [],
	};

	if (!relationInfo.value) return filter;

	const reverseRelation = `$FOLLOW(${relationInfo.value.junctionCollection.collection},${relationInfo.value.junctionField.field})`;

	const selectFilter: Filter = {
		[reverseRelation]: {
			_none: {
				[relationInfo.value.reverseJunctionField.field]: {
					_eq: props.primaryKey,
				},
			},
		},
	};

	if (selectedPrimaryKeys.value.length > 0)
		filter._and.push({
			[relationInfo.value.relatedPrimaryKeyField.field]: {
				_nin: selectedPrimaryKeys.value,
			},
		});

	if (props.primaryKey !== '+') filter._and.push(selectFilter);

	return filter;
});

const { useUserStore, usePermissionsStore } = useStores();
const userStore = useUserStore();
const permissionsStore = usePermissionsStore();

const createAllowed = computed(() => {
	const admin = userStore.currentUser?.role.admin_access === true;
	if (admin) return true;

	const hasJunctionPermissions = !!permissionsStore.permissions.find(
		(permission) =>
			permission.action === 'create' && permission.collection === relationInfo.value?.junctionCollection.collection
	);

	const hasRelatedPermissions = !!permissionsStore.permissions.find(
		(permission) =>
			permission.action === 'create' && permission.collection === relationInfo.value?.relatedCollection.collection
	);

	return hasJunctionPermissions && hasRelatedPermissions;
});

const selectAllowed = computed(() => {
	const admin = userStore.currentUser?.role.admin_access === true;
	if (admin) return true;

	const hasJunctionPermissions = !!permissionsStore.permissions.find(
		(permission) =>
			permission.action === 'create' && permission.collection === relationInfo.value?.junctionCollection.collection
	);

	return hasJunctionPermissions;
});
</script>

<style lang="scss" scoped>
.v-list.gallery-list {
	position: relative;
	--v-list-padding: 0;
	margin-bottom: 20px;
	overflow: hidden;

	.v-list-inner {
		z-index: 10;
		position: relative;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: 150px;
		gap: 20px;

		.v-list-item {
			grid-column: span 2 / span 2;
			--input-height: auto;
			padding: 10px;
			overflow: visible;

			&:hover {
				.gallery-item-resizer {
					opacity: 1;
					visibility: visible;
				}
			}

			&.deleted {
				--v-list-item-border-color: var(--danger-25);
				--v-list-item-border-color-hover: var(--danger-50);
				--v-list-item-background-color: var(--danger-10);
				--v-list-item-background-color-hover: var(--danger-25);

				::v-deep(.v-icon) {
					color: var(--danger-75);
				}
			}

			&.block+.v-list-item.block {
				margin-top: 0;
			}

			.v-icon {
				--v-icon-color: white;
			}
		}
	}

	.gallery-item-resizer {
		position: absolute;
		top: 0;
		right: 0;
		height: 50px;
		bottom: 0;
		width: 8px;
		background: var(--primary);
		border-radius: 50px;
		margin: auto -4px auto 0;
		cursor: e-resize;
		z-index: 100;
		opacity: 0;
		visibility: hidden;

		&:before {
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			bottom: 0;
			background: var(--white);
			width: 2px;
			content: '';
			margin: auto;
			height: 30%;
			opacity: .5;
		}
	}

	.v-list-item-wrapper {
		display: flex;
		height: 100%;
		width: 100%;
		flex-direction: column;
		align-items: flex-start;
	}

	.v-list-item-header {
		display: flex;
		width: 100%;
		z-index: 10;

		.v-list-item-header-actions {
			margin-left: auto;
		}
	}

	.render-template {
		margin-top: auto;
		z-index: 10;

		::v-deep(span:not(.vertical-aligner)) {
			background: var(--background-page);
			border-radius: var(--border-radius);
			padding: 5px 10px;
			line-height: 2;

			&.null {
				display: none;
			}
		}


	}

	.gallery-guides {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		grid-auto-rows: 150px;
		gap: 20px;
		opacity: 0;
		visibility: hidden;
		transition: all .3s ease;

		.resizing & {
			opacity: 1;
			visibility: visible;
		}

		.gallery-guide-item {
			border: dashed 1px var(--background-normal-alt);
		}
	}
}

.actions {
	margin-top: 8px;
	display: flex;
	gap: 8px;

	.v-pagination {
		margin-left: auto;

		::v-deep(.v-button) {
			display: inline-flex;
		}
	}
}

.deselect {
	--v-icon-color: var(--foreground-subdued);
	margin-right: 4px;
	transition: color var(--fast) var(--transition);

	&:hover {
		--v-icon-color: var(--danger);
	}
}

.image-preview {
	position: absolute;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	overflow: hidden;
	background-color: var(--background-normal-alt);
	border-radius: var(--border-radius);

	img {
		z-index: 1;
		width: 100%;
		height: 100%;
		max-height: inherit;
		object-fit: cover;
	}

	.shadow {
		position: absolute;
		bottom: 0;
		left: 0;
		z-index: 2;
		width: 100%;
		height: 100%;
		overflow: hidden;
		line-height: 1;
		white-space: nowrap;
		text-overflow: ellipsis;
		background: linear-gradient(180deg, rgb(13 17 23) 0%, rgba(38, 50, 56, 0) 50%);
	}

	&.is-svg {
		padding: 32px;

		img {
			object-fit: contain;
		}
	}
}
</style>