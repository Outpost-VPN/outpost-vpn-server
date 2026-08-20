global css html
	$blue: #0B56D9
	$blue-dark: #0849BA
	$navy: #0A1430
	$text: #17213D
	$muted: #69748D
	$line: #D9E3F0
	$soft: #F6F9FE
	$green: #159447
	$green-soft: #E9F8ED
	$orange: #E97400
	$orange-soft: #FFF8F1
	$red: #D92D20
	--outpost-brand: $blue
	--outpost-brand-dark: $blue-dark
	--outpost-brand-soft: blue0
	--outpost-navy: $navy
	--outpost-text: $text
	--outpost-muted: $muted
	--outpost-line: $line
	--outpost-soft: $soft
	--outpost-section: $soft
	--outpost-success: $green
	--outpost-success-soft: $green-soft
	--outpost-warning: $orange
	--outpost-warning-soft: $orange-soft
	--outpost-danger: $red
	--outpost-auth-start: blue1
	--outpost-auth-end: blue2
	--outpost-white: hsl(0deg, 0%, 100%)

	box-sizing: border-box
	min-height: 100%
	background: #fff
	color: $text
	ff: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
	-webkit-font-smoothing: antialiased

	*, *:before, *:after box-sizing: inherit

	body
		margin: 0
		min-height: 100vh
		background: #fff

	button, input, select, textarea
		font: inherit

	button
		cursor: pointer
		@disabled
			cursor: not-allowed
			opacity: .55

	h1, h2, h3, p
		margin: 0

	a
		color: inherit
		text-decoration: none

	.outpost-button
		height: 48px
		display: inline-flex
		align-items: center
		justify-content: center
		gap: 10px
		padding: 0 24px
		border: 1px solid transparent
		border-radius: 10px
		background: $blue
		color: var(--outpost-white)
		font-size: 16px
		font-weight: 650
		transition: .18s ease
		@hover background: $blue-dark

		&.secondary
			background: #fff
			color: $blue
			border-color: #B8D0F9
			@hover background: #F3F7FE

		&.danger
			background: #fff
			color: $red
			border-color: #F4BCB8

		&.quiet
			background: transparent
			color: $muted
			border-color: transparent

		&.small
			height: 38px
			padding: 0 16px
			font-size: 14px

		&.header-action
			margin-top: 22px
			> outpost-icon
				transform: translateY(1px)
			> span
				line-height: 1
			@media(max-width: 620px)
				width: 42px
				padding: 0
				span display: none

	.outpost-field
		display: grid
		gap: 8px
		color: $muted
		font-size: 13px
		font-weight: 650

		input, select, textarea
			width: 100%
			min-height: 46px
			border: 1px solid $line
			border-radius: 10px
			padding: 11px 13px
			outline: none
			background: #fff
			color: $text
			@focus border-color: $blue

	.outpost-card
		border: 1px solid $line
		border-radius: 14px
		background: #fff

	.outpost-inline-note
		display: grid
		grid-template-columns: 18px minmax(0, 1fr)
		align-items: center
		gap: 10px

		> i
			width: 18px
			height: 18px
			display: grid
			place-items: center
			line-height: 1
			transform: translateY(1px)

	.outpost-status
		display: inline-flex
		align-items: center
		gap: 8px
		color: $green
		font-size: 15px

		&:before
			content: ''
			width: 8px
			height: 8px
			border-radius: 50%
			background: currentColor

		&.pending color: $orange
		&.revoked color: $muted

	.outpost-modal-backdrop
		pos: fixed
		inset: 0
		z-index: 210
		display: grid
		place-items: center
		padding: 24px
		background: black/28
		backdrop-filter: blur(5px)

		&.animated
			opacity: 0
			transition: opacity 180ms ease-out

			.outpost-modal
				transform: translateY(12px) scale(.985)
				transition: transform 220ms cubic-bezier(.22,1,.36,1)

			&.visible
				opacity: 1
				.outpost-modal transform: none

	.outpost-modal
		width: min(520px, 100%)
		max-height: calc(100vh - 48px)
		display: flex
		flex-direction: column
		overflow: hidden
		padding: 0
		border-radius: 16px
		background: var(--outpost-white)
		color: $text
		box-shadow: 0 24px 80px black/18

		.outpost-modal-header
			display: grid
			grid-template-columns: 46px minmax(0, 1fr) 36px
			align-items: center
			gap: 13px
			padding: 20px 22px
			background: color-mix(in srgb,var(--outpost-brand) 7%,white)

			h2
				font-size: 23px
				line-height: 1.2

			p
				margin-top: 2px
				color: $muted
				font-size: 12px
				line-height: 1.35

		.outpost-modal-mark
			width: 46px
			height: 46px
			display: grid
			place-items: center
			border-radius: 13px
			background: $blue
			color: white
			font-size: 22px
			box-shadow: 0 8px 22px blue6/18

			&.success
				background: $green
				box-shadow: 0 8px 22px green6/18

			&.danger
				background: $red
				box-shadow: 0 8px 22px red6/18

		.outpost-modal-close
			width: 36px
			height: 36px
			display: grid
			place-items: center
			padding: 0
			border: 0
			border-radius: 9px
			outline: none
			background: transparent
			color: $muted
			font-size: 18px
			@hover
				background: var(--outpost-white)
				color: $blue
			@focus-visible color: $blue

		.outpost-modal-body
			min-height: 0
			overflow-y: auto
			padding: 24px 28px 26px
			background: var(--outpost-white)

			> p
				color: $muted
				font-size: 14px
				line-height: 1.5

		.modal-form
			display: grid
			gap: 18px
			margin-top: 0

		.modal-actions
			display: flex
			justify-content: flex-end
			gap: 10px

		.outpost-modal-footer
			padding: 16px 22px
			background: color-mix(in srgb,var(--outpost-brand) 7%,white)

	@media(prefers-reduced-motion: reduce)
		.outpost-modal-backdrop.animated, .outpost-modal-backdrop.animated .outpost-modal
			transition: none

	.outpost-error
		padding: 12px 14px
		border: 1px solid #F8C8C4
		border-radius: 10px
		background: #FFF5F4
		color: $red
		font-size: 14px

	@media(max-width: 760px)
		.outpost-modal-backdrop
			align-items: end
			padding: 0
		.outpost-modal
			width: 100%
			max-height: 92vh
			border-radius: 18px 18px 0 0

			.outpost-modal-header
				grid-template-columns: 42px minmax(0, 1fr) 36px
				gap: 11px
				padding: 18px 20px
				h2 font-size: 21px

			.outpost-modal-mark
				width: 42px
				height: 42px

			.outpost-modal-body padding: 22px 20px
			.outpost-modal-footer
				padding: 16px 20px calc(16px + env(safe-area-inset-bottom))
				.modal-actions flex-wrap: wrap
				.outpost-button padding: 0 14px
