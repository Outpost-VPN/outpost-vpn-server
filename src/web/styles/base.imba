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
	--matreshka-brand: $blue
	--matreshka-brand-dark: $blue-dark
	--matreshka-navy: $navy
	--matreshka-text: $text
	--matreshka-muted: $muted
	--matreshka-line: $line
	--matreshka-soft: $soft
	--matreshka-section: $soft
	--matreshka-success: $green
	--matreshka-success-soft: $green-soft
	--matreshka-warning: $orange
	--matreshka-auth-start: blue1
	--matreshka-auth-end: blue2
	--matreshka-white: hsl(0deg, 0%, 100%)

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

	.matreshka-button
		height: 48px
		display: inline-flex
		align-items: center
		justify-content: center
		gap: 10px
		padding: 0 24px
		border: 1px solid transparent
		border-radius: 10px
		background: $blue
		color: var(--matreshka-white)
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
			> matreshka-icon
				transform: translateY(1px)
			> span
				line-height: 1
			@media(max-width: 620px)
				width: 42px
				padding: 0
				span display: none

	.matreshka-field
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

	.matreshka-card
		border: 1px solid $line
		border-radius: 14px
		background: #fff

	.matreshka-status
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

	.matreshka-modal-backdrop
		pos: fixed
		inset: 0
		z-index: 210
		display: grid
		place-items: center
		padding: 24px
		background: black/28
		backdrop-filter: blur(5px)

	.matreshka-modal
		width: min(520px, 100%)
		max-height: calc(100vh - 48px)
		overflow: auto
		padding: 28px
		border-radius: 16px
		background: var(--matreshka-white)
		box-shadow: 0 24px 80px black/18

		h2 font-size: 24px
		> p
			margin-top: 8px
			color: $muted
			line-height: 1.5

		.modal-form
			display: grid
			gap: 18px
			margin-top: 24px

		.modal-actions
			display: flex
			justify-content: flex-end
			gap: 10px
			margin-top: 24px

	.matreshka-drawer-backdrop
		position: fixed
		inset: 0
		z-index: 210
		overflow: hidden

		.matreshka-drawer-shade
			position: absolute
			inset: 0
			background: black/24
			backdrop-filter: blur(5px)
			opacity: 0
			transition: opacity 220ms ease-out

		.matreshka-drawer
			position: absolute
			top: 0
			right: 0
			bottom: 0
			width: min(520px, 100%)
			display: flex
			flex-direction: column
			overflow: auto
			padding: 34px 38px 30px
			background: var(--matreshka-white)
			color: $text
			box-shadow: -1px 0 0 $line, -24px 0 70px black/10
			transform: translateX(102%)
			transition: transform 360ms cubic-bezier(.22,1,.36,1)

		&.visible
			.matreshka-drawer-shade opacity: 1
			.matreshka-drawer transform: translateX(0)

		.matreshka-drawer-header
			display: flex
			align-items: flex-start
			justify-content: space-between
			gap: 24px

			.eyebrow
				display: block
				margin-bottom: 10px
				color: $blue
				font-size: 11px
				font-weight: 750
				letter-spacing: .1em

			h2
				color: #071127
				font-size: 29px

		.matreshka-drawer-close
			width: 40px
			height: 40px
			display: grid
			place-items: center
			flex: 0 0 40px
			border: 0
			border-radius: 10px
			background: #F4F7FB
			color: #5F6C84

			@hover
				background: #EAF1FC
				color: $blue

		.matreshka-drawer-footer
			display: flex
			justify-content: flex-end
			gap: 10px
			margin-top: auto
			padding-top: 34px

	@media(prefers-reduced-motion: reduce)
		.matreshka-drawer-backdrop
			.matreshka-drawer-shade, .matreshka-drawer transition: none

	.matreshka-error
		padding: 12px 14px
		border: 1px solid #F8C8C4
		border-radius: 10px
		background: #FFF5F4
		color: $red
		font-size: 14px

	@media(max-width: 760px)
		.matreshka-modal-backdrop
			align-items: end
			padding: 0
		.matreshka-modal
			width: 100%
			max-height: 88vh
			border-radius: 18px 18px 0 0

		.matreshka-drawer-backdrop
			.matreshka-drawer
				width: 100%
				padding: 25px 20px calc(22px + env(safe-area-inset-bottom))
			.matreshka-drawer-header h2 font-size: 25px
			.matreshka-drawer-footer .matreshka-button
				flex: 1
				padding: 0 12px

			.matreshka-drawer.person-drawer .person-form .person-avatar-grid
				@important height: 178px
				@important grid-template-columns: repeat(5, 48px)
				@important grid-auto-rows: 48px

				button, img
					@important width: 48px
					@important height: 48px
