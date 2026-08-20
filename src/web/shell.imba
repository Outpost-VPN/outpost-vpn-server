import {t} from './i18n.imba'
import {deviceImages, fmt} from './context.imba'

const marks = {
	brand: '/brand-mark.png'
	success: '/brand-mark-success.png'
}

tag outpost-icon < i
	name = ''

	<self.ph .{"ph-{name}"}>

tag outpost-device-glyph
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

tag outpost-brand-mark
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

tag outpost-engine-mark
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

tag outpost-logo
	version = null

	<self .stacked=!!version>
		<outpost-brand-mark>
		<span.copy>
			<span.name> t('app.name')
			if version
				<small.version> "Версия {version}"

	css
		display: flex
		align-items: center
		gap: 14px
		color: #071536
		.copy display:grid
		.name font-size:28px; font-weight:750; line-height:1
		&.stacked gap:12px
		&.stacked outpost-brand-mark width:48px; height:48px; flex:0 0 48px
		&.stacked .copy gap:2px
		.version display:block; color:var(--outpost-muted); font-size:11px; font-weight:600; line-height:1.25
		@media(max-width: 900px)
			.copy display:none

tag outpost-sidebar
	store = null
	checking = false

	get serverHealthy?
		!serverIssue

	get serverIssue
		return null unless store.data and store.data.system
		const failed = store.data.system.services.find do(item) item.status != 'active'
		return "{fmt.serviceName(failed.name)} не отвечает" if failed
		const transport = store.data.system.transports and store.data.system.transports.find do(item) item.status == 'inactive'
		return "{transport.name} не слушает localhost" if transport
		const rulesets = store.data.system.rulesets
		return "GeoIP/Geosite: {rulesets.lastError}" if rulesets and rulesets.lastError
		const tls = store.data.system.tls
		return null if tls.status == 'valid'
		return tls.error if tls.error
		return 'TLS-сертификат скоро истечёт' if tls.status == 'warning'
		return 'TLS-сертификат истекает' if tls.status == 'critical'
		'TLS не удалось проверить'

	def active path
		store.path == path

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
			<outpost-logo version=store.data.system.version>
		<nav>
			<button.nav-item type="button" .active=active('/') @click=(do store.goto('/')) aria-label=t('nav.home') aria-current=(active('/') ? 'page' : null)>
				<outpost-icon name="house">
				<span> t('nav.home')
			<button.nav-item type="button" .active=active('/connections') @click=(do store.goto('/connections')) aria-label=t('nav.connections') aria-current=(active('/connections') ? 'page' : null)>
				<outpost-icon name="identification-card">
				<span> t('nav.connections')
			<button.nav-item type="button" .active=active('/protocols') @click=(do store.goto('/protocols')) aria-label=t('nav.protocols') aria-current=(active('/protocols') ? 'page' : null)>
				<outpost-icon name="share-network">
				<span> t('nav.protocols')
			<button.nav-item type="button" .active=active('/routes') @click=(do store.goto('/routes')) aria-label=t('nav.routes') aria-current=(active('/routes') ? 'page' : null)>
				<outpost-icon name="path">
				<span> t('nav.routes')
			<button.nav-item type="button" .active=active('/journal') @click=(do store.goto('/journal')) aria-label=t('system.log') aria-current=(active('/journal') ? 'page' : null)>
				<outpost-icon name="book-open">
				<span> t('system.log')
		<div.sidebar-footer>
			<div.utility-nav>
				<button.utility-item type="button" .active=active('/access') @click=(do store.goto('/access')) aria-label="Доступ" title="Доступ" aria-current=(active('/access') ? 'page' : null)>
					<span.utility-mark><outpost-icon name="shield-check">
					<span> 'Доступ'
				<button.utility-item type="button" .active=active('/settings') @click=(do store.goto('/settings')) aria-label="Настройки" title="Настройки" aria-current=(active('/settings') ? 'page' : null)>
					<span.utility-mark><outpost-icon name="gear-six">
					<span> 'Настройки'
			<div.server-health .pending=!serverHealthy?>
				<div.health-state title=(serverIssue or 'Всё работает штатно')>
					<outpost-icon name=(serverHealthy? ? 'check-circle' : 'warning-circle')>
					<span>
						<strong> serverIssue or 'Всё работает штатно'
						<small> fmt.checked(store.data.system.checkedAt)
				<button.health-check type="button" disabled=checking @click=check aria-label="Обновить состояние" title="Обновить состояние">
					<outpost-icon name=(checking ? 'spinner-gap' : 'arrows-clockwise')>

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
			outpost-icon font-size: 25px; color: #3B4966
			@hover background: #DDE9FC
			&.active
				background: #D7E6FC
				color: #0B56D9
				outpost-icon color: #0B56D9
		.sidebar-footer
			margin-top: auto
			margin-left: -18px
			margin-right: -18px
			margin-bottom: -22px
			position: relative
			z-index: 50
		.utility-nav d:grid g:4px p:12px 18px border-top:1px solid #CCD9ED
		.utility-item h:48px d:grid gtc:36px minmax(0,1fr) ai:center g:12px px:12px bd:0 rd:11px bgc:transparent c:#17213D ta:left fs:14px fw:650 ol:none
		.utility-item bgc@hover:#DFEAFB
		.utility-item.active bgc:#D7E6FC c:#0B56D9
		.utility-mark s:36px d:grid ja:center rd:10px bgc:#D7E6FC c:#0B56D9 fs:19px
		.server-health
			height: 96px
			display: flex
			align-items: center
			justify-content: space-between
			gap: 12px
			padding: 0 28px 0 32px
			border-top: 1px solid #CCD9ED
			color: var(--outpost-success)
			.health-state d:flex ai:center min-width:0 g:10px
			.health-state > outpost-icon fl:0 0 auto fs:18px
			.health-state span, .health-state strong, .health-state small d:block
			.health-state strong maw:170px c:var(--outpost-text) fs:13px fw:700 lh:1.25
			.health-state small mt:4px c:var(--outpost-muted) fs:10px white-space:nowrap
			.health-check s:32px fl:0 0 32px d:grid ja:center p:0 bd:1px solid #C8D7EC rd:8px bgc:transparent c:#526581 fs:15px
			.health-check@hover bgc:#DDE9FC c:var(--outpost-brand)
			.health-check outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
			&.pending c:var(--outpost-warning)
		@media(max-width: 900px)
			width: 82px
			padding: 28px 12px 18px
			outpost-logo .copy display: none
			nav span display: none
			.utility-item > span:last-child display: none
			.server-health .health-state span display: none
			.brand margin-left: 9px
			nav margin-top: 38px
			.nav-item padding: 0; justify-content: center
			.sidebar-footer margin-left: -12px; margin-right: -12px; margin-bottom: -18px
			.utility-nav p:10px 12px
			.utility-item gtc:1fr; justify-items:center; p:0
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
			border-top: 1px solid var(--outpost-line)
			.brand, .sidebar-footer display: none
			nav display: grid; grid-template-columns: repeat(5, 1fr); gap: 2px; margin: 0
			.nav-item height: 50px; border-radius: 10px
			.nav-item outpost-icon font-size: 23px

tag outpost-header
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
		small display: block; margin-bottom: 8px; color: var(--outpost-brand); font-size: 14px; font-weight: 650; letter-spacing: .05em; text-transform: uppercase
		h1 color: #071127; font-size: 36px; line-height: 1.2; letter-spacing: -.02em
		p margin-top: 12px; color: #69748D; font-size: 18px
		&.large small margin-bottom: 12px
		&.large h1 font-size: 48px; line-height: 1.05
		&.large p margin-top: 12px
		@media(max-width: 620px)
			&.large h1 font-size: 34px; line-height: 1.08
			&.large p max-width: 100%; white-space: normal; line-height: 1.35

tag outpost-shell
	store = null

	<self>
		<outpost-sidebar store=store>
		<main .overview=(store.path == '/') .access=(store.path == '/access') .settings=(store.path == '/settings') .protocols=(store.path == '/protocols') .journal=(store.path == '/journal')>
			if store.path == '/'
				<outpost-home store=store>
			elif store.path == '/access'
				<outpost-access store=store>
			elif store.path == '/settings'
				<outpost-settings store=store>
			elif store.path == '/connections'
				<outpost-connections store=store>
			elif store.path == '/routes'
				<outpost-routes store=store>
			elif store.path == '/protocols'
				<outpost-protocols store=store>
			elif store.path == '/journal'
				<outpost-journal store=store>

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
			outpost-header
				gap: 10px
				h1 font-size: 31px
				p font-size: 16px
			main margin-left: 0; padding: 30px 20px 96px

tag outpost-gauge
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
		context.strokeStyle = styles.getPropertyValue('--outpost-line')
		context.beginPath!
		context.arc(width / 2, center, radius, Math.PI, 2 * Math.PI)
		context.stroke!
		context.strokeStyle = styles.getPropertyValue('--outpost-brand')
		context.beginPath!
		context.arc(width / 2, center, radius, Math.PI, (1 + Math.max(0, Math.min(100, value)) / 100) * Math.PI)
		context.stroke!

	<self>
		<canvas>
		<strong> "{value}%"

	css self
		pos:relative w:102px h:56px d:grid ai:end jc:center fl:0 0 102px
		canvas pos:absolute inset:0 s:100%
		strong pos:relative zi:1 mb:4px c:var(--outpost-navy) fs:16px fw:750
