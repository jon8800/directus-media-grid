<template>
	<div class="v-skeleton-loader"></div>
</template>

<style>
body {
	--v-skeleton-loader-color: var(--background-page);
	--v-skeleton-loader-background-color: var(--background-subdued);
}
</style>

<style lang="scss" scoped>
@mixin loader {
	position: relative;
	overflow: hidden;
	background-color: var(--v-skeleton-loader-background-color);

	&::after {
		position: absolute;
		top: 0;
		right: 0;
		left: 0;
		z-index: 1;
		height: 100%;
		background: linear-gradient(90deg, transparent, var(--v-skeleton-loader-color), transparent);
		transform: translateX(-100%);
		opacity: 0.5;
		animation: loading 1.5s infinite;
		content: '';
	}

	@keyframes loading {
		100% {
			transform: translateX(100%);
		}
	}
}

.v-skeleton-loader {
	width: 100%;
	--input-height: auto;
	aspect-ratio: 4/3;
	border: var(--border-width) solid var(--v-skeleton-loader-background-color);
	border-radius: var(--border-radius);

	@include loader;
	position: relative;
	overflow: hidden;
	cursor: progress;
}

.fade-enter-active,
.fade-leave-active {
	transition: opacity var(--medium) var(--transition);
}

.fade-enter-from,
.fade-leave-to {
	position: absolute;
	opacity: 0;
}
</style>
