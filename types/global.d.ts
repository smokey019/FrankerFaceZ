
declare global {
	const __version_major__: number;
	const __version_minor__: number;
	const __version_patch__: number;
	const __version_prerelease__: number[];
	const __git_commit__: string | null;
	const __version_build__: string;

	/** The configured CDN / static-asset base URL (from the FFZ_CDN env var). */
	const __ffz_server__: string;
	/** The configured data-API base URL (from the FFZ_API env var). */
	const __ffz_api__: string;
	/** The configured staging API base URL (from the FFZ_STAGING_API env var). */
	const __ffz_staging_api__: string;
	/** The configured staging CDN base URL (from the FFZ_STAGING_CDN env var). */
	const __ffz_staging_cdn__: string;
}

export {}
