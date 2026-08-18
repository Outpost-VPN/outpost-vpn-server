import {avatarUrl} from './avatar-picker.imba'
import {t} from './i18n.imba'
import {deviceImages, fmt} from './context.imba'

const marks = {
	brand: '/brand-mark.png'
	success: '/brand-mark-success.png'
}

tag matreshka-icon < i
	name = ''

	<self.ph .{"ph-{name}"}>

tag matreshka-device-glyph
	kind = 'phone'

	<self aria-hidden="true">
		<img src=(deviceImages[kind] or deviceImages.other) alt="">

	css
		width: 38px
		height: 38px
		display: inline-grid
		place-items: center
		flex: 0 0 38px
		img width: 100%; height: 100%; display: block; object-fit: contain

tag matreshka-brand-mark
	tone = 'brand'

	<self aria-hidden="true">
		<img src=(marks[tone] or marks.brand) alt="">

	css
		position: relative
		display: block
		width: 40px
		height: 40px
		flex: 0 0 40px
		img width:100%; height:100%; display:block; object-fit:contain

tag matreshka-engine-mark
	kind = ''

	<self .hysteria=(kind == 'hysteria') .xray=(kind == 'xray') aria-hidden="true">
		<span.glyph> kind == 'hysteria' ? 'H' : 'X'

	css
		position: relative
		display: inline-grid
		place-items: center
		width: 34px
		height: 34px
		color: currentColor
		.glyph display:block; color:currentColor; font-family:Arial,sans-serif; font-size:25px; font-weight:850; line-height:1; letter-spacing:0

tag matreshka-logo
	<self>
		<matreshka-brand-mark>
		<span> t('app.name')

	css
		display: flex
		align-items: center
		gap: 14px
		color: #071536
		font-size: 28px
		font-weight: 750

tag matreshka-sidebar
	store = null
	avatar = 'avatar-current'
	checking = false

	get owner
		store.data and store.data.auth and store.data.auth.owner

	get serverHealthy?
		return true unless store.data and store.data.system
		store.data.system.tls.status == 'valid' and store.data.system.services.every do(item) item.status == 'active'

	def active path
		path == '/' ? store.path == '/' : store.path.startsWith(path)

	def check
		return if checking
		checking = true
		try
			store.data.system = await store.api('GET', '/api/v1/system')
		finally
			checking = false
			imba.commit!

	<self>
		<div.brand>
			<matreshka-logo>
			<small.version> "Версия {store.data.system.version}"
		<nav>
			<button.nav-item type="button" .active=active('/') @click=(do store.goto('/')) aria-label=t('nav.home') aria-current=(active('/') ? 'page' : null)>
				<matreshka-icon name="house">
				<span> t('nav.home')
			<button.nav-item type="button" .active=active('/people') @click=(do store.goto('/people')) aria-label=t('nav.people') aria-current=(active('/people') ? 'page' : null)>
				<matreshka-icon name="users">
				<span> t('nav.people')
			<button.nav-item type="button" .active=active('/proxies') @click=(do store.goto('/proxies')) aria-label=t('nav.proxies') aria-current=(active('/proxies') ? 'page' : null)>
				<matreshka-icon name="share-network">
				<span> t('nav.proxies')
			<button.nav-item type="button" .active=active('/routes') @click=(do store.goto('/routes')) aria-label=t('nav.routes') aria-current=(active('/routes') ? 'page' : null)>
				<matreshka-icon name="path">
				<span> t('nav.routes')
			<button.nav-item type="button" .active=(store.path.startsWith('/journal') or store.path.startsWith('/system/log')) @click=(do store.goto('/journal')) aria-label=t('system.log') aria-current=((store.path.startsWith('/journal') or store.path.startsWith('/system/log')) ? 'page' : null)>
				<matreshka-icon name="book-open">
				<span> t('system.log')
		<div.sidebar-footer>
			<div.owner-area>
				<button.owner type="button" .active=store.path.startsWith('/profile') @click=(do store.goto('/profile')) aria-current=(store.path.startsWith('/profile') ? 'page' : null)>
					<img.avatar src=avatarUrl(avatar) alt="">
					<div>
						<strong> owner.name
						<small> t('role.owner')
					<matreshka-icon name="caret-right">
			<div.server-health .pending=!serverHealthy?>
				<div.health-state>
					<matreshka-icon name=(serverHealthy? ? 'check-circle' : 'warning-circle')>
					<span>
						<strong> serverHealthy? ? 'Всё работает штатно' : 'Требуется внимание'
						<small> fmt.checked(store.data.system.checkedAt)
				<button.health-check type="button" disabled=checking @click=check aria-label="Обновить состояние" title="Обновить состояние">
					<matreshka-icon name=(checking ? 'spinner-gap' : 'arrows-clockwise')>

	css
		width: 300px
		min-height: 100vh
		position: fixed
		inset: 0 auto 0 0
		z-index: 20
		display: flex
		flex-direction: column
		padding: 44px 18px 22px
		border-right: 0
		background: #EAF2FF
		.brand margin-left: 24px
		.brand .version display:block; margin-top:5px; margin-left:54px; color:var(--matreshka-muted); font-size:11px; font-weight:600
		nav
			display: grid
			gap: 9px
			margin-top: 38px
		.nav-item
			height: 56px
			display: flex
			align-items: center
			gap: 18px
			padding: 0 24px
			border: 0
			border-radius: 13px
			background: transparent
			color: #17213D
			font-size: 16px
			font-weight: 600
			text-align: left
			matreshka-icon font-size: 25px; color: #3B4966
			@hover background: #DDE9FC
			&.active
				background: #D7E6FC
				color: #0B56D9
				matreshka-icon color: #0B56D9
		.sidebar-footer
			margin-top: auto
			margin-left: -18px
			margin-right: -18px
			margin-bottom: -22px
			position: relative
			z-index: 50
		.owner-area position: relative
		.owner
			width: 100%
			display: grid
			grid-template-columns: 54px 1fr auto
			align-items: center
			gap: 12px
			padding: 25px 32px
			border-top: 1px solid #CCD9ED
			border-right: 0
			border-bottom: 0
			border-left: 0
			background: transparent
			color: #17213D
			text-align: left
			position: relative
			z-index: 2
			outline: none
			@hover background: #DFEAFB
			&.active background: #D7E6FC
			&.active color: #0B56D9
			.avatar
				width: 54px
				height: 54px
				object-fit: cover
				border-radius: 50%
			strong, small display: block
			strong font-size: 15px
			small margin-top: 4px; color: #69748D; font-size: 12px
		.server-health
			height: 96px
			display: flex
			align-items: center
			justify-content: space-between
			gap: 12px
			padding: 0 28px 0 32px
			border-top: 1px solid #CCD9ED
			color: var(--matreshka-success)
			.health-state d:flex ai:center min-width:0 g:10px
			.health-state > matreshka-icon fl:0 0 auto fs:18px
			.health-state span, .health-state strong, .health-state small d:block
			.health-state strong c:var(--matreshka-text) fs:13px fw:700 white-space:nowrap
			.health-state small mt:4px c:var(--matreshka-muted) fs:10px white-space:nowrap
			.health-check s:32px fl:0 0 32px d:grid ja:center p:0 bd:1px solid #C8D7EC rd:8px bgc:transparent c:#526581 fs:15px
			.health-check@hover bgc:#DDE9FC c:var(--matreshka-brand)
			.health-check matreshka-icon.ph-spinner-gap animation:spin 1s linear infinite
			&.pending c:var(--matreshka-warning)
		@media(max-width: 900px)
			width: 82px
			padding: 28px 12px 18px
			matreshka-logo span:last-child display: none
			.brand .version display: none
			nav span display: none
			.owner strong, .owner small, .owner > i, .server-health .health-state span display: none
			.brand margin-left: 9px
			nav margin-top: 38px
			.nav-item padding: 0; justify-content: center
			.sidebar-footer margin-left: -12px; margin-right: -12px; margin-bottom: -18px
			.owner grid-template-columns: 1fr; justify-items: center; padding-left: 12px; padding-right: 12px
			.server-health flex-direction:column; justify-content: center; gap: 8px; padding-left: 0; padding-right: 0
			.server-health .health-state g:0
		@media(max-width: 620px)
			width: 100%
			height: 68px
			min-height: 0
			position: fixed
			top: auto
			right: 0
			bottom: 0
			left: 0
			z-index: 50
			padding: 8px 12px
			border-right: 0
			border-top: 1px solid var(--matreshka-line)
			.brand, .sidebar-footer display: none
			nav display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; margin: 0
			.nav-item height: 50px; border-radius: 10px
			.nav-item matreshka-icon font-size: 23px

tag matreshka-header
	title = ''
	subtitle = ''
	eyebrow = ''
	large = false

	<self .large=large>
		<div>
			if eyebrow
				<small> eyebrow
			<h1> title
			<p> subtitle

	css
		display: flex
		align-items: flex-start
		justify-content: space-between
		gap: 24px
		small display: block; margin-bottom: 8px; color: var(--matreshka-brand); font-size: 14px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase
		h1 color: #071127; font-size: 36px; line-height: 1.2; letter-spacing: -.02em
		p margin-top: 12px; color: #69748D; font-size: 18px
		&.large small margin-bottom: 12px
		&.large h1 font-size: 48px; line-height: 1.05
		&.large p margin-top: 12px
		@media(max-width: 620px)
			&.large h1 font-size: 34px; line-height: 1.08
			&.large p max-width: 100%; white-space: normal; line-height: 1.35

tag matreshka-shell
	store = null
	avatar = 'avatar-current'

	<self>
		<matreshka-sidebar store=store avatar=avatar>
		<main .overview=(store.path == '/') .profile=store.path.startsWith('/profile') .proxies=store.path.startsWith('/proxies') .system=store.path.startsWith('/system') .journal=(store.path.startsWith('/journal') or store.path.startsWith('/system/log'))>
			if store.path == '/'
				<matreshka-home store=store>
			elif store.path.startsWith('/profile')
				<matreshka-profile store=store>
			elif store.path.startsWith('/people')
				<matreshka-people store=store>
			elif store.path.startsWith('/routes')
				<matreshka-routes store=store>
			elif store.path.startsWith('/traffic')
				<matreshka-traffic store=store>
			elif store.path.startsWith('/proxies')
				<matreshka-proxies store=store>
			elif store.path.startsWith('/journal') or store.path.startsWith('/system/log')
				<matreshka-journal store=store>
			elif store.path.startsWith('/system')
				<matreshka-system store=store>
			else
				<matreshka-home store=store>

	css
		display: block
		height: 100vh
		overflow: hidden
		main
			height: 100vh
			min-height: 0
			margin-left: 300px
			overflow-y: auto
			overscroll-behavior: contain
			padding: 60px clamp(32px, 5vw, 82px)
		@media(max-width: 900px)
			main margin-left: 82px; padding: 48px 28px
		@media(max-width: 620px)
			matreshka-header
				gap: 10px
				h1 font-size: 31px
				p font-size: 16px
			main margin-left: 0; padding: 30px 20px 96px

tag matreshka-invite-banner
	store = null

	<self>
		<div.icon><matreshka-icon name="user-plus">
		<div.copy>
			<h2> t('action.invite')
			<p> 'Отправьте приглашение — подключение займёт минуту.'
		<button.matreshka-button @click=(do store.open('person'))>
			<matreshka-icon name="paper-plane-tilt">
			<span> t('action.invite')

	css
		margin-top: 42px
		min-height: 148px
		display: grid
		grid-template-columns: 92px 1fr auto
		align-items: center
		gap: 28px
		padding: 28px 42px
		border: 1.5px dashed #6D9CE8
		border-radius: 14px
		background: #FBFDFF
		.icon
			width: 92px
			height: 92px
			display: grid
			place-items: center
			border: 1px solid #C8D9F8
			border-radius: 50%
			color: #0B56D9
			i font-size: 40px
		h2 color: #0B56D9; font-size: 27px
		p margin-top: 12px; color: #69748D; font-size: 16px
		@media(max-width: 840px)
			grid-template-columns: 64px 1fr
			padding: 24px
			.icon width: 64px; height: 64px
			button grid-column: 1 / -1

tag matreshka-gauge
	value = 0
	observer = null

	def mount
		observer = new ResizeObserver(do draw!)
		observer.observe(self)
		window.requestAnimationFrame do draw!

	def unmount
		observer && observer.disconnect!

	def draw
		const canvas = self.querySelector('canvas')
		return unless canvas
		const width = canvas.clientWidth
		const height = canvas.clientHeight
		return unless width and height
		const ratio = window.devicePixelRatio or 1
		canvas.width = width * ratio
		canvas.height = height * ratio
		const context = canvas.getContext('2d')
		context.scale(ratio, ratio)
		context.clearRect(0, 0, width, height)
		context.lineWidth = 6
		context.lineCap = 'round'
		const radius = Math.min(width / 2 - 7, height - 8)
		const center = height - 6
		const styles = window.getComputedStyle(self)
		context.strokeStyle = styles.getPropertyValue('--matreshka-line')
		context.beginPath!
		context.arc(width / 2, center, radius, Math.PI, 2 * Math.PI)
		context.stroke!
		context.strokeStyle = styles.getPropertyValue('--matreshka-brand')
		context.beginPath!
		context.arc(width / 2, center, radius, Math.PI, (1 + Math.max(0, Math.min(100, value)) / 100) * Math.PI)
		context.stroke!

	<self>
		<canvas>
		<strong> "{value}%"

	css self
		pos:relative w:102px h:56px d:grid ai:end jc:center fl:0 0 102px
		canvas pos:absolute inset:0 s:100%
		strong pos:relative zi:1 mb:4px c:var(--matreshka-navy) fs:16px fw:750
