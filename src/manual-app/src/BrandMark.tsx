export function BrandMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 512 512"
			className={className}
			aria-hidden="true"
			focusable="false"
		>
			<rect width="512" height="512" fill="var(--primary, #0a6ed1)" />
		</svg>
	);
}
