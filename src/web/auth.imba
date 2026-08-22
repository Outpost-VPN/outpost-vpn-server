import {language, languages, setLanguage, t} from './i18n.imba'
import {fmt, webauthn} from './context.imba'

tag outpost-language-switcher
	store = null

	def choose value
		setLanguage(value)
		const url = new URL(window.location.href)
		url.searchParams.set('lang', value)
		window.history.replaceState({}, '', url)
		store.title! if store

	<self aria-label="Language">
		for item in languages
			<button type="button" lang=item.id .active=(language! == item.id) aria-pressed=(language! == item.id) @click=(do choose(item.id))> item.label

	css self
		pos:fixed t:18px r:22px zi:100 d:flex g:4px p:4px rd:10px bgc:white/88 bdf:blur(8px) bxs:0 8px 24px black/8 direction:ltr
		button p:7px 9px bd:0 rd:7px bgc:transparent c:var(--outpost-muted) fs:11px fw:650 white-space:nowrap
		button@hover bgc:var(--outpost-soft) c:var(--outpost-brand)
		button.active bgc:var(--outpost-auth-start) c:var(--outpost-brand)
		@media(max-width: 560px)
			t:12px r:12px l:12px jc:center
			button p:6px 7px fs:10px

tag outpost-auth-shell
	mode = 'setup'
	store = null
	copied = false

	get story
		if mode == 'preflight'
			return {
				badge: t('setup.story.badge')
				title: t('setup.story.title')
				subtitle: t('setup.story.subtitle')
				points: [
					{icon: 'activity', text: t('setup.story.running')}
					{icon: 'shield-check', text: t('setup.story.secure')}
					{icon: 'browser', text: t('setup.story.browser')}
				]
			}
		const prefix = mode == 'setup' ? 'onboarding' : 'auth'
		const points = [
			{icon: 'browser', text: t('auth.story.web')}
			{icon: 'plugs-connected', text: t('auth.story.protocols')}
			{icon: 'device-mobile', text: t('auth.story.clients')}
			{icon: 'arrows-clockwise', text: t('onboarding.story.updates')}
			{icon: 'lightning', text: t('auth.story.speed')}
			{icon: 'arrows-left-right', text: t('auth.story.transfer')}
			{icon: 'fingerprint-simple', text: t('onboarding.story.device')}
		]
		{
			badge: t("{prefix}.story.badge")
			title: t("{prefix}.story.title")
			subtitle: t("{prefix}.story.subtitle")
			points: points
		}

	def copy
		const root = window.location.pathname.split('/').filter(Boolean)[0] or 'admin'
		await window.navigator.clipboard.writeText("{window.location.origin}/{root}/")
		copied = true
		imba.commit!

	<self .preflight=(mode == 'preflight')>
		<outpost-language-switcher store=store>
		<aside>
			<outpost-logo>
			<div.story>
				<span.eyebrow> story.badge
				<h2> story.title
				<p> story.subtitle
				<ul>
					for point in story.points
						<li>
							<outpost-icon name=point.icon>
							<span> point.text
			<div.host>
				<outpost-icon name="globe-hemisphere-west">
				<div>
					<small> copied ? t('auth.host.copied') : (mode == 'preflight' ? t('setup.host') : t('auth.host'))
					<span.technical> window.location.host
				<button.copy type="button" @click=copy aria-label=(copied ? t('auth.host.copied') : t('auth.host.copy')) title=(copied ? t('auth.host.copied') : t('auth.host.copy'))>
					<outpost-icon name=(copied ? 'check' : 'copy')>
		<main>
			<slot>

	css self
		mih:100vh d:grid gtc:minmax(340px, .86fr) minmax(0, 1.34fr) bgc:white
		aside
			d:flex fld:column p:clamp(36px, 5vw, 72px) bg:linear-gradient(145deg, var(--outpost-auth-start), var(--outpost-auth-end))
			outpost-logo margin-bottom:clamp(72px, 13vh, 140px)
			.story maw:480px
			.eyebrow d:block mb:20px c:var(--outpost-brand) fs:12px fw:750 ls:.09em tt:uppercase
			h2 c:var(--outpost-navy) fs:clamp(32px, 3.4vw, 50px) lh:1.08 ls:-.035em
			p mt:24px c:var(--outpost-muted) fs:17px lh:1.65
			ul d:grid g:16px mt:36px p:0 list-style:none
			li d:flex ai:center g:12px c:var(--outpost-text) fs:15px fw:650
			li outpost-icon s:34px d:grid ja:center rd:10px bgc:white c:var(--outpost-brand) fs:18px bxs:0 8px 24px black/6
			.host d:flex ai:center g:11px mt:auto pt:48px c:var(--outpost-muted)
			.host outpost-icon c:var(--outpost-success) fs:19px
			.host > div fl:1 min-width:0
			.host small, .host span d:block
			.host small mb:3px fs:10px fw:750 ls:.06em tt:uppercase
			.host span fs:13px
			.host .copy s:36px d:grid ja:center ml:auto bd:1px solid var(--outpost-line) rd:10px bgc:white c:var(--outpost-brand)
			.host .copy outpost-icon c:inherit fs:17px
			.host .copy@hover bgc:var(--outpost-auth-start)
		main d:grid place-items:center p:clamp(28px, 6vw, 84px)
		&.preflight main p:32px clamp(28px, 6vw, 84px)
		@media(max-width: 820px)
			gtc:1fr gtr:auto 1fr
			aside p:24px 22px
			aside outpost-logo m:0
			aside .story, aside .host d:none
			main p:44px 20px 56px place-items:center

tag outpost-login
	store = null
	busy = false
	message = null

	def mount
		return if new URLSearchParams(window.location.search).has('lang')
		try
			const state = await store.api('GET', '/api/v1/auth/state')
			setLanguage(state.owner.language) if state.owner and state.owner.language
			store.title!
		catch
			null

	def login
		busy = true
		message = null
		try
			const start = await store.api('POST', '/api/v1/auth/login/options', {})
			const credential = await window.navigator.credentials.get({publicKey: webauthn.decode(start.options)})
			await store.api('POST', '/api/v1/auth/login/verify', {challengeId: start.challengeId, response: webauthn.json(credential)})
			store.goto('/')
			await store.load!
		catch issue
			message = issue.message
		finally
			busy = false
			imba.commit!

	<self>
		<outpost-auth-shell mode="login" store=store>
			<section.auth-panel.login-panel>
				<span.panel-badge> t('auth.badge')
				<h1> t('auth.title')
				<p> t('auth.subtitle')
				if message
					<div.outpost-error> message
				<button.outpost-button disabled=busy @click=login>
					<outpost-icon name=(busy ? 'spinner-gap' : 'fingerprint')>
					<span> busy ? t('auth.wait') : t('auth.button')
				<div.trust>
					<outpost-icon name="shield-check">
					<span> t('auth.secure')
				<details.recovery>
					<summary> t('auth.recovery.title')
					<p> t('auth.recovery.subtitle')
					<code> 'sudo outpostctl bootstrap-reset'

	css self
		.auth-panel maw:480px
		.panel-badge d:block mb:26px c:var(--outpost-brand) fs:12px fw:750 ls:.08em tt:uppercase
		h1 c:var(--outpost-navy) fs:38px lh:1.14 ls:-.025em
		.auth-panel > p mt:14px c:var(--outpost-muted) fs:17px lh:1.6
		.auth-panel > .outpost-error mt:22px
		.auth-panel > .outpost-button w:100% mt:30px
		.auth-panel > .outpost-button outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		.trust d:flex ai:flex-start g:9px mt:18px c:var(--outpost-muted) fs:13px lh:1.45
		.trust outpost-icon mt:2px c:var(--outpost-success) fs:17px
		.recovery mt:32px pt:24px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:13px
		.recovery summary cursor:pointer c:var(--outpost-text) fw:650
		.recovery p mt:12px lh:1.55
		.recovery code d:block mt:12px p:11px 13px rd:9px bgc:var(--outpost-soft) c:var(--outpost-text) fs:12px
		@media(max-width: 560px)
			h1 fs:32px

tag outpost-setup
	store = null
	step = 0
	direction = 1
	source = ''
	free = ''
	own = ''
	domain = ''
	server = ''
	preview = false
	loading = true
	busy = false
	copied = false
	help = false
	message = null
	onboarding = null
	status = 'available'

	def setup
		const params = new URLSearchParams(window.location.search)
		const hostname = window.location.hostname
		preview = params.get('preview') == 'setup'
		if preview
			server = params.get('ip') or '203.0.113.42'
		else
			server = params.get('ip') or (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) ? hostname : '203.0.113.42')
		loading = !preview

	def mount
		load! unless preview

	def load
		try
			const state = await store.api('GET', '/api/v1/setup')
			status = state.status
			server = state.publicIp if state.publicIp
		catch issue
			message = issue.message
		finally
			loading = false
			imba.commit!

	get providers
		[
			{name: 'DuckDNS', note: t('setup.domain.duckdns'), url: 'https://www.duckdns.org/', featured: true}
			{name: 'FreeMyIP', note: t('setup.domain.freemyip'), url: 'https://freemyip.com/'}
			{name: 'dynv6', note: t('setup.domain.dynv6'), url: 'https://dynv6.com/'}
		]

	get field
		if source == 'free'
			return {label: t('setup.domain.label_free'), placeholder: t('setup.domain.placeholder_free')}
		{label: t('setup.domain.label_own'), placeholder: t('setup.domain.placeholder_own')}

	get entry do source == 'free' ? free : own

	get address
		try
			let value = entry.trim!.toLowerCase!
			return '' unless value
			value = "https://{value}" unless value.includes('://')
			new URL(value).hostname
		catch
			''

	get valid? do address.includes('.') and !address.endsWith('.')
	get blocked? do busy or !valid?
	get record do valid? ? address : field.placeholder

	def move next, vector
		direction = vector
		step = next

	def advance
		move 1, 1 if source

	def back
		move Math.max(0, step - 1), -1

	def copy
		await window.navigator.clipboard.writeText(server)
		copied = true
		imba.commit!

	def clean
		return unless valid?
		if source == 'free'
			free = address
		else
			own = address

	def toggle
		help = !help

	def verify
		return unless valid?
		domain = address
		busy = true
		message = null
		try
			if preview
				await new Promise do(resolve) window.setTimeout(resolve, 900)
				move 2, 1
			else
				const result = await store.api('POST', '/api/v1/setup/domain', {domain: domain, language: language!})
				domain = result.domain
				onboarding = result.onboardingUrl
				move 2, 1
				imba.commit!
				# The root-agent schedules the control-plane restart two seconds after
				# returning, so wait for the final domain/RP configuration to be live.
				await new Promise do(resolve) window.setTimeout(resolve, 2500)
				window.location.assign(onboarding)
				return
		catch issue
			message = issue.message
		finally
			busy = false
			imba.commit!

	def open_owner
		if onboarding
			window.location.assign(onboarding)
			return
		store.goto("/onboarding?preview=setup&lang={window.encodeURIComponent(language!)}")

	<self>
		<outpost-auth-shell mode="preflight" store=store>
			<section.auth-panel.setup-panel .backwards=(direction < 0)>
				if loading
					<div.step.loading-step>
						<outpost-icon name="spinner-gap">
				elif status == 'configured'
					<div.step.configured-step>
						<span.panel-badge> t('setup.configured.badge')
						<div.configured-icon><outpost-icon name="warning-circle">
						<h1> t('setup.configured.title')
						<p> t('setup.configured.done')
						<div.configured-warning>
							<strong> t('setup.configured.warning')
							<span> t('setup.configured.action')
				elif message and step == 0
					<div.step.error-step>
						<div.outpost-error> message
						<button.outpost-button @click=load>
							<outpost-icon name="arrows-clockwise">
							<span> t('Повторить')
				elif step == 0
					<form.step.choice-step [o@off:0 ease:340ms] ease @submit.prevent=advance>
						<span.panel-badge> t('setup.badge')
						<h1> t('setup.domain.title')
						<p> t('setup.domain.subtitle')
						<div.sources>
							<label.source .selected=(source == 'free')>
								<input type="radio" bind=source value="free">
								<outpost-icon name="gift">
								<div>
									<strong> t('setup.domain.free')
									<small> t('setup.domain.free_hint')
									<p> t('setup.domain.free_detail')
								<span.choice-mark><outpost-icon name="check">
							<label.source .selected=(source == 'own')>
								<input type="radio" bind=source value="own">
								<outpost-icon name="globe-hemisphere-west">
								<div>
									<strong> t('setup.domain.own')
									<small> t('setup.domain.own_hint')
									<p> t('setup.domain.own_detail')
								<span.choice-mark><outpost-icon name="check">
						<button.outpost-button type="submit" disabled=!source>
							<span> t('setup.domain.continue')
							<outpost-icon name="arrow-right">
				elif step == 1
					<form.step.configure-step [o@off:0 ease:340ms] ease @submit.prevent=verify>
						<div.progress>
							<span> t('setup.configure.progress')
							<div.dots>
								<i.active>
								<i.active>
								<i>
						<button.back type="button" @click=back>
							<outpost-icon name="arrow-left">
							<span> t('onboarding.back')
						if source == 'free'
							<h1> t('setup.free.title')
							<p> t('setup.free.subtitle')
							<div.free-box>
								<div.guide>
									<strong> t('setup.domain.service')
									<small> t('setup.domain.service_hint')
								<div.catalog>
									for provider in providers
										<a href=provider.url target="_blank" rel="noopener noreferrer">
											<span>
												<strong> provider.name
												<em> t('setup.domain.recommended') if provider.featured
											<small> provider.note
											<outpost-icon name="arrow-square-out">
								<div.server-ip>
									<span> preview ? t('setup.domain.server_preview') : t('setup.domain.server')
									<strong.technical> server
									<button type="button" @click=copy aria-label=(copied ? t('setup.dns.copied') : t('setup.dns.copy'))>
										<outpost-icon name=(copied ? 'check' : 'copy')>
							<label.outpost-field.domain-field>
								<span> field.label
								<input.technical bind=free @blur=clean autofocus autocomplete="url" placeholder=field.placeholder>
						else
							<h1> t('setup.own.title')
							<p> t('setup.own.subtitle')
							<label.outpost-field.domain-field>
								<span> field.label
								<input.technical bind=own @blur=clean autofocus autocomplete="url" placeholder=field.placeholder>
							<div.record-guide>
								<strong> t('setup.own.record')
								<div.dns-card>
									<div.record>
										<small> t('setup.dns.type')
										<strong.technical> 'A'
									<div.record>
										<small> t('setup.dns.name')
										<strong.technical> record
									<div.record>
										<small> t('setup.dns.value')
										<strong.mono> server
										<button.copy-value type="button" @click=copy>
											<outpost-icon name=(copied ? 'check' : 'copy')>
											<span> copied ? t('setup.dns.copied') : t('setup.dns.copy')
								<p.provider> t('setup.own.record_hint')
							<div.netlify .expanded=help>
								<button.netlify-head type="button" @click=toggle aria-expanded=help>
									<outpost-icon name="cloud">
									<span> t('setup.own.netlify')
									<outpost-icon.chevron name="caret-down">
								<div.netlify-body .open=help>
									<div.netlify-content>
										<p> t('setup.own.netlify_hint')
										<a href="https://docs.netlify.com/manage/domains/set-up-netlify-dns/" target="_blank" rel="noopener noreferrer">
											<span> t('setup.own.netlify_link')
											<outpost-icon name="arrow-square-out">
						<div.waiting>
							<outpost-icon name="clock">
							<span> t('setup.dns.waiting')
						if message
							<div.outpost-error> message
						<button.outpost-button type="submit" disabled=blocked?>
							<outpost-icon name=(busy ? 'spinner-gap' : 'arrows-clockwise')>
							<span> busy ? t('setup.dns.checking') : t('setup.dns.check')
						<div.notice>
							<outpost-icon name="info">
							<span> t('setup.domain.note')
				else
					<div.step.complete [o@off:0 ease:340ms] ease>
						<span.panel-badge> t('setup.ready.badge')
						<h1> t('setup.ready.title')
						<p> t('setup.ready.subtitle')
						<div.ready-list>
							<div>
								<outpost-icon name="check-circle">
								<span> t('setup.ready.dns')
							<div>
								<outpost-icon name="check-circle">
								<span> t('setup.ready.tls')
							<div.address>
								<outpost-icon name="lock-key">
								<strong.technical> "https://{domain}"
						<button.outpost-button @click=open_owner>
							<span> t('setup.ready.continue')
							<outpost-icon name="arrow-right">
						<small.bootstrap>
							<outpost-icon name="shield-check">
							<span> t('setup.ready.owner')

	css self
		.auth-panel pos:relative w:min(620px, 100%) mih:620px
		.step w:100% mih:620px d:flex fld:column jc:center tween:opacity 240ms ease-out, transform 340ms cubic-bezier(.22,1,.36,1)
		.loading-step ja:center c:var(--outpost-brand) fs:28px
		.loading-step outpost-icon animation:spin 1s linear infinite
		.error-step .outpost-button mt:20px
		.configured-step .configured-icon s:52px d:grid ja:center mb:22px rd:14px bgc:var(--outpost-warning-soft) c:var(--outpost-warning) fs:28px
		.configured-warning d:grid g:8px mt:26px p:17px rd:12px bgc:var(--outpost-warning-soft) c:var(--outpost-text) fs:13px lh:1.55
		.configured-warning span c:var(--outpost-muted)
		.step@enter o:0; transform:translateX(36px)
		.step@leave pos:absolute t:0 l:0 o:0; transform:translateX(-36px)
		.auth-panel.backwards .step@enter transform:translateX(-36px)
		.auth-panel.backwards .step@leave transform:translateX(36px)
		.panel-badge d:block mb:24px c:var(--outpost-brand) fs:12px fw:750 ls:.08em tt:uppercase
		h1 c:var(--outpost-navy) fs:36px lh:1.15 ls:-.025em
		.step > p mt:14px c:var(--outpost-muted) fs:16px lh:1.6
		.sources d:grid gtc:1fr 1fr g:12px mt:28px
		.source pos:relative d:grid gtc:46px 1fr ai:start g:13px mih:178px p:19px 42px 18px 18px bd:1px solid var(--outpost-line) rd:15px bgc:white cursor:pointer tween:border-color 160ms ease, background-color 160ms ease
		.source@hover border-color:#B8D0F9 bgc:var(--outpost-soft)
		.source.selected bd:1px solid var(--outpost-brand) bgc:var(--outpost-auth-start)
		.source input pos:absolute o:0 pe:none
		.source > outpost-icon s:44px d:grid ja:center rd:12px bgc:var(--outpost-soft) c:var(--outpost-brand) fs:22px
		.source.selected > outpost-icon bgc:white
		.source strong, .source small d:block
		.source strong c:var(--outpost-text) fs:15px
		.source small mih:31px mt:5px c:var(--outpost-brand) fs:11px fw:700 lh:1.4
		.source p mih:50px mt:11px c:var(--outpost-muted) fs:11px lh:1.5
		.choice-mark pos:absolute r:14px t:14px s:21px d:grid ja:center rd:full bgc:var(--outpost-brand) c:white fs:12px o:0 transform:scale(.72) tween:opacity 160ms ease, transform 160ms ease
		.source.selected .choice-mark o:1 transform:scale(1)
		.choice-step > .outpost-button mt:25px
		.free-box mt:18px p:15px rd:13px bgc:var(--outpost-soft)
		.guide d:flex ai:baseline jc:space-between g:12px
		.guide strong c:var(--outpost-text) fs:12px
		.guide small c:var(--outpost-muted) fs:10px
		.catalog d:grid gtc:repeat(3, 1fr) g:8px mt:10px
		.catalog a pos:relative d:block p:10px 28px 9px 10px bd:1px solid var(--outpost-line) rd:9px bgc:white tween:border-color 160ms ease, transform 160ms ease
		.catalog a@hover border-color:#B8D0F9; transform:translateY(-1px)
		.catalog a > span d:flex ai:center g:5px
		.catalog strong c:var(--outpost-text) fs:11px
		.catalog small d:block mt:4px c:var(--outpost-muted) fs:9px
		.catalog em p:2px 4px rd:full bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:7px fw:800 font-style:normal tt:uppercase
		.catalog outpost-icon pos:absolute r:8px t:11px c:var(--outpost-brand) fs:12px
		.server-ip d:flex ai:center g:9px mt:11px pt:11px border-top:1px solid var(--outpost-line) c:var(--outpost-muted) fs:10px
		.server-ip span fl:1
		.server-ip strong c:var(--outpost-text) fs:12px
		.server-ip button s:28px d:grid ja:center p:0 bd:0 rd:8px bgc:white c:var(--outpost-brand)
		.server-ip button@hover bgc:var(--outpost-auth-start)
		.domain-field mt:18px
		.domain-field input::placeholder c:var(--outpost-muted) o:.55
		.step > .outpost-button w:100% mt:22px
		.notice d:flex ai:center g:9px mt:18px c:var(--outpost-muted) fs:12px lh:1.5
		.notice outpost-icon c:var(--outpost-brand) fs:16px
		.progress d:flex ai:center jc:space-between mb:22px c:var(--outpost-brand) fs:12px fw:750
		.dots d:flex g:6px
		.dots i s:7px rd:full bgc:var(--outpost-line)
		.dots i.active w:20px bgc:var(--outpost-brand)
		.back d:flex ai:center g:7px mb:20px p:0 bd:0 bgc:transparent c:var(--outpost-muted) fs:13px
		.back@hover c:var(--outpost-brand)
		.record-guide mt:20px
		.record-guide > strong d:block mb:10px c:var(--outpost-text) fs:12px
		.dns-card bd:1px solid var(--outpost-line) rd:14px bgc:white of:hidden
		.record pos:relative d:grid gtc:128px 1fr auto ai:center g:14px p:13px 15px border-bottom:1px solid var(--outpost-line)
		.record@last-child border-bottom:0
		.record small c:var(--outpost-muted) fs:10px fw:750 ls:.05em tt:uppercase
		.record strong c:var(--outpost-text) fs:14px
		.record .mono fs:15px
		.copy-value d:flex ai:center g:7px p:8px 10px bd:0 rd:8px bgc:var(--outpost-soft) c:var(--outpost-brand) fs:11px fw:700
		.copy-value@hover bgc:var(--outpost-auth-start)
		.provider mt:12px c:var(--outpost-muted) fs:11px lh:1.5
		.netlify mt:14px bd:1px solid var(--outpost-line) rd:12px bgc:white of:hidden
		.netlify-head w:100% d:grid gtc:28px 1fr 18px ai:center g:9px p:12px 14px bd:0 bgc:white cursor:pointer c:var(--outpost-text) fs:12px fw:650 ta:left
		.netlify-head > outpost-icon@first-child s:28px d:grid ja:center rd:8px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:15px
		.netlify .chevron c:var(--outpost-muted) fs:14px tween:transform 160ms ease
		.netlify.expanded .chevron transform:rotate(180deg)
		.netlify-body d:grid gtr:0fr o:0 tween:grid-template-rows 260ms cubic-bezier(.22,1,.36,1), opacity 180ms ease
		.netlify-body.open gtr:1fr o:1
		.netlify-content min-height:0 of:hidden
		.netlify-content > p p:0 14px c:var(--outpost-muted) fs:11px lh:1.55
		.netlify-content > a d:flex ai:center g:6px w:max-content m:10px 14px 14px c:var(--outpost-brand) fs:11px fw:700
		.waiting d:flex ai:center g:9px mt:17px c:var(--outpost-muted) fs:12px lh:1.45
		.waiting outpost-icon fl:0 0 auto c:var(--outpost-warning) fs:16px
		.step > .outpost-button outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		.ready-list d:grid g:11px mt:26px p:17px rd:14px bgc:var(--outpost-soft)
		.ready-list > div d:flex ai:center g:10px c:var(--outpost-text) fs:13px
		.ready-list outpost-icon c:var(--outpost-success) fs:18px
		.ready-list .address mt:3px pt:13px border-top:1px solid var(--outpost-line)
		.ready-list .address outpost-icon c:var(--outpost-brand)
		.ready-list strong fs:13px
		.bootstrap d:grid gtc:16px auto ai:center jc:center g:8px mt:17px c:var(--outpost-muted) fs:12px lh:1.45 ta:left
		.bootstrap outpost-icon c:var(--outpost-success) fs:15px
		@media(max-width: 560px)
			.auth-panel, .step mih:560px
			h1 fs:30px
			.sources gtc:1fr
			.source mih:auto
			.source small mih:auto
			.source p mih:auto
			.guide small d:none
			.catalog small d:none
			.copy-value span d:none
			.record gtc:104px 1fr auto

tag outpost-onboarding
	store = null
	step = 0
	direction = 1
	intent = ''
	archive = null
	password = ''
	timezone = Intl.DateTimeFormat!.resolvedOptions!.timeZone or 'UTC'
	busy = false
	restarting = false
	message = null
	preview = false

	def setup
		const mode = new URLSearchParams(window.location.search).get('preview')
		preview = mode == 'setup' or mode == 'restore'
		if mode == 'restore'
			intent = 'restore'
			step = 1

	get encrypted? do archive and archive.name.toLowerCase!.endsWith('.age')
	get oversized? do archive and archive.size > 256 * 1024 * 1024
	get ready? do archive and !oversized? and (!encrypted? or (password.length >= 12 and password.length <= 200))
	get detail do archive ? fmt.bytes(archive.size) : t('restore.file_hint')

	def move next, vector
		direction = vector
		step = next
		message = null

	def advance
		move step + 1, 1

	def select value
		intent = value
		move 1, 1

	def choose e
		archive = e.target.files[0] or null
		password = '' unless encrypted?
		message = null
		message = t('restore.too_large') if oversized?

	def restore
		return unless ready?
		busy = true
		message = null
		try
			if preview
				await new Promise do(resolve) window.setTimeout(resolve, 700)
				restarting = true
				await new Promise do(resolve) window.setTimeout(resolve, 900)
				move 2, 1
				return
			const params = new URLSearchParams(window.location.search)
			const body = new window.FormData
			body.append('archive', archive)
			body.append('claimToken', params.get('claim') or '')
			body.append('passphrase', password) if encrypted?
			const response = await window.fetch('/api/v1/setup/restore', {method: 'POST', body: body})
			unless response.ok
				let failure = t('restore.failed')
				try
					const payload = await response.json!
					failure = payload.message or failure
				catch
					failure = t('restore.too_large') if response.status == 413
				throw new Error(failure)
			restarting = true
			imba.commit!
			for attempt in [0 .. 89]
				await new Promise do(resolve) window.setTimeout(resolve, 1000)
				try
					const state = await window.fetch('/api/v1/auth/state', {cache: 'no-store'})
					if state.ok and (await state.json!).initialized
						window.location.assign('/admin/login')
						return
				catch
					null
			throw new Error(t('restore.timeout'))
		catch issue
			message = issue.message
			restarting = false
		finally
			busy = false
			imba.commit!

	def back
		move Math.max(0, step - 1), -1

	def create
		busy = true
		message = null
		try
			if preview
				await new Promise do(resolve) window.setTimeout(resolve, 650)
				move 2, 1
				return
			const params = new URLSearchParams(window.location.search)
			const body = {timezone: timezone, language: language!}
			body.claimToken = params.get('claim') if params.get('claim')
			body.recoveryToken = params.get('recovery') if params.get('recovery')
			const start = await store.api('POST', '/api/v1/auth/register/options', body)
			const credential = await window.navigator.credentials.create({publicKey: webauthn.decode(start.options)})
			await store.api('POST', '/api/v1/auth/register/verify', {challengeId: start.challengeId, response: webauthn.json(credential)})
			store.goto('/')
			await store.load!
		catch issue
			message = issue.message
		finally
			busy = false
			imba.commit!

	<self>
		<outpost-auth-shell mode="setup" store=store>
			<section.auth-panel.setup-panel .backwards=(direction < 0)>
				if step == 0
					<div.step [o@off:0 ease:340ms] ease>
						<span.panel-badge> t('onboarding.badge')
						<h1> t('onboarding.start.title')
						<p> t('onboarding.start.subtitle')
						<div.start-grid>
							<button.start-card type="button" @click=(do select('new'))>
								<span.start-icon><outpost-icon name="sparkle">
								<div.start-copy>
									<strong> t('onboarding.start.new')
									<small> t('onboarding.start.new_hint')
								<outpost-icon.arrow name="arrow-right">
							<button.start-card.restore type="button" @click=(do select('restore'))>
								<span.start-icon><outpost-icon name="cloud-arrow-down">
								<div.start-copy>
									<strong> t('onboarding.start.restore')
									<small> t('onboarding.start.restore_hint')
								<outpost-icon.arrow name="arrow-right">
				elif step == 1 and intent == 'restore'
					<form.step [o@off:0 ease:340ms] ease @submit.prevent=restore>
						<div.progress>
							<span> t('restore.progress')
							<div.dots>
								<i.active>
								<i.active>
						<button.back type="button" @click=(do move(0, -1))>
							<outpost-icon name="arrow-left">
							<span> t('onboarding.back')
						<h1> t('restore.title')
						<p> t('restore.subtitle')
						<div.restore-domain>
							<outpost-icon name="link-simple">
							<div>
								<strong> t('restore.domain')
								<span> t('restore.domain_hint')
						<label.restore-file .selected=!!archive>
							<input type="file" accept=".age,.tar,application/octet-stream,application/x-tar" @change=choose>
							<span.file-icon><outpost-icon name=(archive ? 'file-check' : 'upload-simple')>
							<span.file-copy>
								<strong> archive ? archive.name : t('restore.file')
								<small> detail
							<span.file-action> t('restore.choose')
						if encrypted?
							<label.outpost-field.restore-password>
								<span> t('restore.password')
								<input type="password" bind=password autocomplete="current-password" placeholder=t('restore.password_hint')>
						if message
							<div.outpost-error> message
						if restarting
							<div.restore-status role="status">
								<outpost-icon name="spinner-gap">
								<div>
									<strong> t('restore.working')
									<span> t('restore.restarting')
						<button.outpost-button type="submit" disabled=(busy or !ready?)>
							<outpost-icon name=(busy ? 'spinner-gap' : 'cloud-arrow-down')>
							<span> busy ? t('restore.working') : t('restore.action')
						<small.bootstrap>
							<outpost-icon name="shield-check">
							<span> t('restore.login')
				elif step == 1
					<div.step [o@off:0 ease:340ms] ease>
						<div.progress>
							<span> t('onboarding.progress.passkey')
							<div.dots>
								<i.active>
								<i.active>
						<button.back type="button" @click=(do move(0, -1))>
							<outpost-icon name="arrow-left">
							<span> t('onboarding.back')
						<h1> t('onboarding.passkey.title')
						<p> t('onboarding.passkey.subtitle')
						<div.passkey-note>
							<outpost-icon name="device-mobile-camera">
							<div>
								<strong> t('onboarding.passkey.system')
								<span> t('onboarding.passkey.system_hint')
						if message
							<div.outpost-error> message
						<button.outpost-button disabled=busy @click=create>
							<outpost-icon name=(busy ? 'spinner-gap' : 'fingerprint')>
							<span> busy ? t('onboarding.passkey.wait') : t('onboarding.button')
						<small.bootstrap>
							<outpost-icon name="shield-check">
							<span> t('onboarding.secure')
				else
					<div.step [o@off:0 ease:340ms] ease>
						<span.panel-badge> t('Предпросмотр')
						<h1> intent == 'restore' ? t('restore.title') : t('Настройка доступа завершена')
						<p> intent == 'restore' ? t('restore.restarting') : t('В preview-режиме passkey не создавался, а данные владельца не записывались.')
						<button.outpost-button @click=(do move(0, -1))>
							<outpost-icon name="arrow-counter-clockwise">
							<span> t('Начать сначала')

	css self
		.auth-panel pos:relative w:min(520px, 100%) mih:560px
		.step w:100% mih:560px d:flex fld:column jc:center tween:opacity 240ms ease-out, transform 340ms cubic-bezier(.22,1,.36,1)
		.step@enter o:0; transform:translateX(36px)
		.step@leave pos:absolute t:0 l:0 o:0; transform:translateX(-36px)
		.auth-panel.backwards .step@enter transform:translateX(-36px)
		.auth-panel.backwards .step@leave transform:translateX(36px)
		.step > .panel-badge d:block mb:24px c:var(--outpost-brand) fs:12px fw:750 ls:.08em tt:uppercase
		h1 c:var(--outpost-navy) fs:36px lh:1.15 ls:-.025em
		.step > p mt:14px c:var(--outpost-muted) fs:16px lh:1.6
		.start-grid d:grid g:12px mt:28px
		.start-card pos:relative w:100% d:grid gtc:48px minmax(0,1fr) 20px ai:center g:14px p:17px bd:1px solid var(--outpost-line) rd:14px bgc:white ta:left tween:border-color 160ms ease, background-color 160ms ease, transform 160ms ease
		.start-card@hover border-color:#B8D0F9 bgc:var(--outpost-soft); transform:translateY(-1px)
		.start-card .start-icon s:46px d:grid ja:center rd:12px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:22px
		.start-card.restore .start-icon bgc:var(--outpost-success-soft) c:var(--outpost-success)
		.start-copy miw:0
		.start-card strong, .start-card small d:block
		.start-card strong c:var(--outpost-text) fs:15px
		.start-card small mt:5px c:var(--outpost-muted) fs:12px lh:1.4
		.start-card .arrow c:var(--outpost-brand) fs:17px
		.restore-domain d:grid gtc:36px minmax(0,1fr) ai:start g:11px mt:24px p:13px rd:11px bgc:var(--outpost-success-soft)
		.restore-domain > outpost-icon s:36px d:grid ja:center rd:10px bgc:white c:var(--outpost-success) fs:18px
		.restore-domain strong, .restore-domain span d:block
		.restore-domain strong c:var(--outpost-text) fs:13px
		.restore-domain span mt:4px c:var(--outpost-muted) fs:11px lh:1.45
		.restore-file pos:relative d:grid gtc:42px minmax(0,1fr) auto ai:center g:12px mt:17px p:14px bd:1px dashed var(--outpost-line) rd:12px bgc:white cursor:pointer tween:border-color 160ms ease, background-color 160ms ease
		.restore-file@hover, .restore-file.selected border-color:#9DBDF0 bgc:var(--outpost-soft)
		.restore-file input pos:absolute o:0 pe:none
		.file-icon s:42px d:grid ja:center rd:10px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:20px
		.file-copy miw:0
		.file-copy strong, .file-copy small d:block of:hidden text-overflow:ellipsis white-space:nowrap
		.file-copy strong c:var(--outpost-text) fs:13px
		.file-copy small mt:4px c:var(--outpost-muted) fs:11px
		.file-action p:7px 9px rd:8px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:10px fw:700 white-space:nowrap
		.restore-password mt:15px
		.restore-status d:grid gtc:28px minmax(0,1fr) ai:start g:10px mt:16px p:12px rd:10px bgc:var(--outpost-soft)
		.restore-status > outpost-icon mt:2px c:var(--outpost-brand) fs:20px animation:spin 1s linear infinite
		.restore-status strong, .restore-status span d:block
		.restore-status strong fs:12px
		.restore-status span mt:4px c:var(--outpost-muted) fs:11px lh:1.4
		.setup-points d:grid g:17px mt:27px p:0 list-style:none
		.setup-points li d:grid gtc:30px 1fr ai:start g:12px
		.setup-points outpost-icon s:30px d:grid ja:center rd:full bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:16px
		.setup-points strong, .setup-points span d:block
		.setup-points strong c:var(--outpost-text) fs:14px
		.setup-points span mt:4px c:var(--outpost-muted) fs:12px lh:1.45
		.step > .outpost-button w:100% mt:30px
		.bootstrap d:flex ai:center jc:center g:8px mt:17px c:var(--outpost-muted) fs:12px lh:1.45 ta:center
		.bootstrap outpost-icon c:var(--outpost-success) fs:15px
		.progress d:flex ai:center jc:space-between mb:24px c:var(--outpost-brand) fs:12px fw:750
		.dots d:flex g:6px
		.dots i s:7px rd:full bgc:var(--outpost-line)
		.dots i.active w:22px bgc:var(--outpost-brand)
		.back d:flex ai:center g:7px mb:22px p:0 bd:0 bgc:transparent c:var(--outpost-muted) fs:13px
		.back@hover c:var(--outpost-brand)
		.passkey-note d:grid gtc:38px 1fr ai:start g:13px mt:27px p:16px rd:12px bgc:var(--outpost-soft)
		.passkey-note > outpost-icon s:38px d:grid ja:center rd:10px bgc:white c:var(--outpost-brand) fs:20px
		.passkey-note strong, .passkey-note span d:block
		.passkey-note strong c:var(--outpost-text) fs:14px
		.passkey-note span mt:5px c:var(--outpost-muted) fs:12px lh:1.45
		.step > .outpost-error mt:20px
		.step > .outpost-button outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		@media(max-width: 560px)
			h1 fs:30px

global css
	.auth-screen
		min-height: 100vh
		display: grid
		place-items: center
		padding: 28px
		background: var(--outpost-soft)
	.auth-card
		width: min(430px, 100%)
		padding: 40px
		border: 1px solid var(--outpost-line)
		border-radius: 18px
		background: #fff
		box-shadow: 0 20px 60px #0C1E4110
		&.wide width: min(520px, 100%)
		outpost-logo margin-bottom: 44px
		.auth-icon width: 64px; height: 64px; display: grid; place-items: center; margin-bottom: 22px; border-radius: 50%; background: #EAF1FC; color: #0B56D9
		.auth-icon outpost-icon font-size: 32px
		h1 color: #071127; font-size: 30px; line-height: 1.2
		> p margin-top: 12px; color: #69748D; font-size: 16px; line-height: 1.5
		> .outpost-button width: 100%; margin-top: 28px
		> .outpost-error margin-top: 20px
		.secure display: flex; gap: 8px; margin-top: 20px; color: #7C879C; line-height: 1.45
