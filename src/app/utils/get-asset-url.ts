import { addTokenToURL } from './add-token-to-url';
import { getPublicURL } from './get-root-path';

export function getAssetUrl(filename: string, isDownload?: boolean): string {
	const assetUrl = new URL(`assets/${filename}`, getPublicURL());

	if (isDownload) {
		assetUrl.searchParams.set('download', '');
	}

	return addTokenToURL(assetUrl.href);
}
