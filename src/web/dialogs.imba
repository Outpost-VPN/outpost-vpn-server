import {basicSetup} from 'codemirror'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import {indentWithTab} from '@codemirror/commands'
import {indentUnit} from '@codemirror/language'
import {json, jsonParseLinter} from '@codemirror/lang-json'
import {yaml} from '@codemirror/lang-yaml'
import {linter, lintGutter} from '@codemirror/lint'
import {t} from './i18n.imba'
import {diagnostics, fmt} from './context.imba'

const connectionPlatforms = [
	{id: 'ios', name: 'iOS', icon: 'apple-logo'}
	{id: 'macos', name: 'macOS', icon: 'apple-logo'}
	{id: 'android', name: 'Android', icon: 'android-logo'}
	{id: 'windows', name: 'Windows', icon: 'windows-logo'}
	{id: 'linux', name: 'Linux', icon: 'linux-logo'}
]

const advancedIcons = {
	'vless-links': 'link-simple'
	'mihomo-yaml': 'file-code'
	'sing-box-json': 'brackets-curly'
	'xray-json': 'brackets-curly'
}

tag outpost-connection-modal
	store = null
	name = ''
	avatar = 'avatar-person'
	expanded = false
	saving = false
	closing = false
	visible = false

	get editing? do !!store.selected

	def setup
		if editing?
			name = store.selected.name
			avatar = store.selected.avatar or 'avatar-person'

	get valid?
		!!name.trim!

	get hint
		t('Название и аватар помогут узнать подключение в списке.')

	def toggle
		expanded = !expanded

	def mount
		window.requestAnimationFrame do
			visible = true
			imba.commit!

	def close
		return if closing
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'connection'
			store.close!
			imba.commit!

	def archive
		return if closing
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'connection'
			store.dialogKey++
			store.dialog = 'archive'
			store.error = null
			imba.commit!

	def save
		return unless valid?
		saving = true
		try
			const method = editing? ? 'PATCH' : 'POST'
			const url = editing? ? "/api/v1/connections/{store.selected.id}" : '/api/v1/connections'
			const payload = {avatar: avatar, color: editing? ? store.selected.color : 'blue'}
			payload.name = name.trim!
			const result = await store.api(method, url, payload)
			await store.load!
			if editing?
				await close!
			else
				closing = true
				visible = false
				imba.commit!
				const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220
				await new Promise do(resolve) window.setTimeout(resolve, delay)
				store.selected = result.connection
				store.dialogKey++
				store.dialog = 'connect'
				store.error = null
				imba.commit!
		catch issue
			store.error = issue.message
			imba.commit!
		finally
			saving = false

	<self>
		<global @keydown.esc=close>
			<div.outpost-modal-backdrop.animated .visible=visible @click.self=close>
				<div.outpost-modal.connection-modal role="dialog" aria-modal="true" aria-label=(editing? ? t('Редактирование подключения') : t('Новое подключение')) @click.stop>
					<header.outpost-modal-header>
						<span.outpost-modal-mark><outpost-icon name=(editing? ? 'pencil-simple' : 'link-simple')>
						<div>
							<h2> editing? ? t('Редактировать подключение') : t('action.addConnection')
							<p> hint
						<button.outpost-modal-close type="button" @click=close aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						<div.connection-form>
							<div.connection-summary>
								<div.connection-avatar>
									<outpost-avatar value=avatar size="104">
									<button.connection-avatar-toggle type="button" @click=toggle aria-expanded=expanded aria-controls="connection-avatar-options">
										<span> expanded ? t('Свернуть') : t('Изменить аватар')
										<outpost-icon name=(expanded ? 'caret-up' : 'caret-down')>
								<label.outpost-field.connection-name>
									<span> t('connections.name')
									<input bind=name placeholder=t('Например, Мама, Семья или Гости') autofocus required>
							if expanded
								<section.avatar-choice id="connection-avatar-options">
									<span> t('Выберите аватар')
									<outpost-avatar-picker compact=true value=avatar change=(do(value) avatar = value)>
						if store.error
							<div.outpost-error> store.error
					<footer.outpost-modal-footer>
						<div.modal-actions>
							if editing?
								<button.outpost-button.quiet.archive-action type="button" @click=archive>
									<outpost-icon name="archive">
									<span> t('Архивировать')
							<button.outpost-button.quiet type="button" @click=close> t('action.cancel')
							<button.outpost-button type="button" disabled=(saving or !valid?) @click=save>
								<outpost-icon name=(saving ? 'spinner-gap' : 'check')>
								<span> saving ? t('Сохраняем…') : (editing? ? t('Сохранить') : t('Создать подключение'))

	css self
		display: contents
		.connection-modal w:min(720px,100%)
		.connection-form d:grid g:20px
		.connection-summary d:grid gtc:144px minmax(0,1fr) ai:center g:28px
		.connection-avatar d:grid jc:center justify-items:center g:9px
		.connection-avatar-toggle d:inline-flex ai:center g:6px p:3px 5px bd:0 bgc:transparent c:var(--outpost-brand) fs:13px fw:650 cur:pointer
		.connection-avatar-toggle@hover c:var(--outpost-navy)
		.connection-avatar-toggle@focus-visible outline:2px solid var(--outpost-brand); outline-offset:3px; border-radius:6px
		.connection-avatar-toggle outpost-icon fs:13px
		.connection-name min-width:0
		.avatar-choice pt:18px bdt:1px solid var(--outpost-line)
		.avatar-choice > span d:block mb:11px c:#69748D fs:13px fw:650
		.avatar-choice outpost-avatar-picker display:block
		.outpost-error margin-top: 18px
		.archive-action margin-right: auto; color: #C1453C
		.outpost-modal-footer i.ph-spinner-gap animation: spin 1s linear infinite
		@media(max-width: 560px)
			.connection-summary gtc:1fr g:18px
			.connection-avatar justify-self:center
			.archive-action span display: none

tag outpost-connect-modal
	store = null
	connection = null
	mode = 'universal'
	platform = 'macos'
	platformOpen = false
	moreOpen = false
	chosen = null
	message = null
	polling = false
	copied = null
	saving = false
	closing = false
	visible = false

	get target
		store.selected

	get choices
		return [] unless connection
		connection.applications.filter do(item) item.platforms.includes(platform)

	get primary
		choices.filter do(item) item.primaryFor.includes(platform)

	get secondary
		choices.filter do(item) !item.primaryFor.includes(platform)

	get current
		choices.find(do(item) item.id == chosen) or primary[0] or choices[0]

	get install
		current and current.installUrls[platform]

	get currentPlatform
		connectionPlatforms.find do(item) item.id == platform

	def cost item
		return '' unless item
		return t('connect.free') if item.pricing.model == 'free'
		return t('connect.freemium') if item.pricing.model == 'freemium'
		item.pricing.billing == 'subscription' ? t('connect.paid_subscription') : t('connect.paid_once')

	get price
		return '' unless current
		return t('connect.free') if current.pricing.model == 'free'
		return t('connect.freemium') if current.pricing.model == 'freemium'
		current.pricing.billing == 'subscription' ? t('connect.paid_subscription') : t('connect.paid_once')

	get update
		current and current.updateMode == 'automatic' ? t('connect.auto') : t('connect.manual')

	get fidelity
		current and current.routeFidelity == 'exact' ? t('connect.exact') : t('connect.limited')

	def mount
		const agent = window.navigator.userAgent.toLowerCase!
		platform = 'ios' if /iphone|ipad|ipod/.test(agent)
		platform = 'android' if /android/.test(agent)
		platform = 'windows' if /windows/.test(agent)
		platform = 'linux' if /linux|x11/.test(agent) and platform == 'macos'
		window.requestAnimationFrame do
			window.requestAnimationFrame do
				visible = true
				imba.commit!
				connect!

	def unmount
		polling = false

	def close
		return if closing
		polling = false
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 220
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'connect'
			store.close!
			imba.commit!

	def connect
		return if connection or saving or !target
		saving = true
		message = null
		try
			const current = target
			connection = current.status == 'provisioning' ? await store.api('POST', "/api/v1/connections/{current.id}/retry", {}) : await store.api('GET', "/api/v1/connections/{current.id}/subscription")
			await store.load! if connection.state == 'ready'
			imba.commit!
			watch! if ['provisioning','rotating','archiving'].includes(connection.state)
		catch issue
			message = issue.message
		finally
			saving = false
			imba.commit!

	def watch
		return if polling or !connection
		polling = true
		while polling and connection and ['provisioning','rotating','archiving'].includes(connection.state)
			await new Promise do(resolve) window.setTimeout(resolve, 2000)
			break unless polling
			try
				connection = await store.api('GET', "/api/v1/connections/{connection.connection.id}/subscription")
				message = null
			catch issue
				message = issue.message
			imba.commit!
		polling = false
		await store.load! if connection and connection.state == 'ready'

	def retry
		return unless connection
		message = null
		saving = true
		try
			connection = await store.api('POST', "/api/v1/connections/{connection.connection.id}/retry", {})
			watch! if ['provisioning','rotating','archiving'].includes(connection.state)
		catch issue
			message = issue.message
		finally
			saving = false
			imba.commit!

	def rotate
		return unless connection and connection.state == 'ready'
		return unless window.confirm(t('connect.reset_confirm'))
		saving = true
		message = null
		try
			connection = await store.api('POST', "/api/v1/connections/{connection.connection.id}/rotate", {})
			await store.load!
			watch! if ['provisioning','rotating'].includes(connection.state)
		catch issue
			message = issue.message
		finally
			saving = false
			imba.commit!

	def select item
		mode = 'app'
		chosen = item.id
		moreOpen = false
		copied = null

	def os value
		platform = value
		platformOpen = false
		moreOpen = false
		chosen = null
		mode = 'app'
		copied = null

	def systems
		platformOpen = !platformOpen
		moreOpen = false

	def more
		moreOpen = !moreOpen
		platformOpen = false

	def reveal
		mode = 'universal'
		platformOpen = false
		moreOpen = false
		copied = null

	def apps
		mode = 'app'
		platformOpen = false
		moreOpen = false
		copied = null

	def expert
		mode = 'advanced'
		platformOpen = false
		moreOpen = false
		copied = null

	def advanced item
		await copy(item.profileUrl, "advanced-{item.id}")

	get subtitle
		return t('Outpost выпускает credentials подключения.') unless connection and connection.state == 'ready'
		t('connect.method')

	def copy value, key
		return unless value
		await window.navigator.clipboard.writeText(value)
		copied = key
		imba.commit!

	<self>
		<global @keydown.esc=close>
			<div.outpost-modal-backdrop.animated .visible=visible @click.self=close>
				<div.outpost-modal.connect-modal role="dialog" aria-modal="true" aria-label=t('Подключение') @click.stop>
					<header.outpost-modal-header>
						<span.outpost-modal-mark .success=(connection and connection.state == 'ready')><outpost-icon name=(connection and connection.state == 'ready' ? 'check' : 'spinner-gap')>
						<div>
							<h2> connection and connection.state == 'ready' ? t('Подключение готово') : t('Готовим подключение')
							<p> subtitle
						<button.outpost-modal-close type="button" @click=close aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						if connection and connection.state == 'ready'
							<nav.connect-tabs aria-label=t('Способ подключения')>
								<button.connect-tab type="button" .active=(mode == 'universal') aria-current=(mode == 'universal' ? 'page' : null) @click=reveal>
									<outpost-icon name="link-simple">
									<span> t('connect.universal')
								<button.connect-tab type="button" .active=(mode == 'app') aria-current=(mode == 'app' ? 'page' : null) @click=apps>
									<outpost-icon name="squares-four">
									<span> t('connect.for_app')
								if connection.advanced and connection.advanced.length
									<button.connect-tab.expert type="button" .active=(mode == 'advanced') aria-current=(mode == 'advanced' ? 'page' : null) @click=expert>
										<outpost-icon name="code">
										<span> t('connect.advanced')
							<div.connect-stage>
								if mode == 'universal'
									<div.universal-screen>
										<div.universal-qr>
											<strong> t('connect.universal')
											<div.qr-frame><img src=connection.subscription.qrUrl alt=t('Универсальный QR-код подключения')>
											<button.profile-copy-link type="button" @click=(do copy(connection.subscription.url, 'universal'))>
												<outpost-icon name=(copied == 'universal' ? 'check' : 'copy')>
												<span> copied == 'universal' ? t('Скопировано') : t('action.copy')
										<div.universal-copy>
											<h3> t('connect.one_link')
											<div.link-options>
												<div.link-option>
													<span.link-option-icon><outpost-icon name="globe-hemisphere-west">
													<div>
														<strong> t('connect.open_browser_title')
														<p> t('connect.open_browser_hint')
														<a.browser-preview href=connection.subscription.url target="_blank" rel="noreferrer">
															<span> t('connect.preview_short')
															<outpost-icon name="arrow-square-out">
												<div.link-option>
													<span.link-option-icon><outpost-icon name="plus-square">
													<div>
														<strong> t('connect.add_subscription_title')
														<p> t('connect.add_subscription_hint')
											<div.detection-note>
												<outpost-icon name="info">
												<p> t('connect.unknown_client')
								elif mode == 'app' and current
									<div.app-screen>
										<div.app-toolbar>
											<div.platform-select>
												<button.platform-trigger type="button" aria-label=t('connect.platform') aria-expanded=platformOpen @click=systems>
													<outpost-icon.platform-icon name=currentPlatform.icon>
													<span.technical> currentPlatform.name
													<outpost-icon name="caret-down">
												if platformOpen
													<global @click.capture.outside=(platformOpen = false)>
													<div.picker-popover>
														for item in connectionPlatforms
															<button.platform-option type="button" .active=(platform == item.id) @click=(do os(item.id))>
																<outpost-icon.platform-icon name=item.icon>
																<span.technical> item.name
																if platform == item.id
																	<outpost-icon.check name="check">
											<div.app-strip role="tablist" aria-label=t('connect.apps')>
												for item in primary
													<button.app-choice type="button" role="tab" aria-selected=(current.id == item.id) .active=(current.id == item.id) @click=(do select(item))>
														<img src=item.icon alt="">
														<span>
															<strong.technical> item.name
															<small> cost(item)
											if secondary.length
												<div.more-picker>
													<button.more-trigger type="button" aria-expanded=moreOpen @click=more>
														<span> t('connect.more_count', {count: secondary.length})
														<outpost-icon name="caret-down">
													if moreOpen
														<global @click.capture.outside=(moreOpen = false)>
														<div.picker-popover>
															for item in secondary
																<button type="button" .active=(current.id == item.id) @click=(do select(item))>
																	<img src=item.icon alt="">
																	<span>
																		<strong.technical> item.name
																		<small> cost(item)
										<div.app-profile>
											<div.app-visual>
												<div.qr-frame.app-qr-frame><img.profile-qr src=current.qrUrl alt="QR · {current.name}">
												<button.profile-copy-link type="button" @click=(do copy(current.profileUrl, current.id))>
													<outpost-icon name=(copied == current.id ? 'check' : 'copy')>
													<span> copied == current.id ? t('Скопировано') : t('action.copy')
											<div.profile-copy>
												<div.profile-heading>
													<img.app-icon src=current.icon alt="">
													<h3.technical> current.name
													<span.price .paid=(current.pricing.model == 'paid')> price
													if install
														<a.app-source-link href=install target="_blank" rel="noreferrer">
															<span> t('connect.install')
															<outpost-icon name="arrow-square-out">
												<p> current.description
												<div.profile-facts>
													<span .warning=(current.updateMode == 'manual')>
														<outpost-icon name="arrows-clockwise">
														<em> update
													<span>
														<outpost-icon name="list-checks">
														<em> fidelity
												<details.device-actions>
													<summary>
														<span> t('connect.this_device')
														<outpost-icon name="caret-down">
													<div.device-content>
														if current.openUrl
															<a.device-link href=current.openUrl>
																<outpost-icon name="arrow-square-out">
																<span>
																	<strong> t('connect.open_connect')
																	<small> t('connect.open_hint')
														else
															<div.device-unavailable>
																<outpost-icon name="info">
																<span>
																	<strong> t('connect.open_unavailable')
																	<small> t('connect.open_unavailable_hint')
								elif mode == 'advanced'
									<div.expert-screen>
										<div.expert-list>
											for item in connection.advanced
												<button.expert-choice type="button" @click=(do advanced(item))>
													<span.expert-icon><outpost-icon name=(advancedIcons[item.id] or 'file-code')>
													<span.expert-format>
														<strong.technical> item.name
														<small> item.description
													<span.expert-copy>
														<outpost-icon name=(copied == "advanced-{item.id}" ? 'check' : 'copy')>
														<em> copied == "advanced-{item.id}" ? t('Скопировано') : t('connect.copy')
						else
							<div.activation-state>
								<outpost-icon name="spinner-gap">
								<strong> connection and ['retrying','rotation_retry','archive_retry'].includes(connection.state) ? t('Не удалось завершить операцию') : connection and connection.state == 'rotating' ? t('connect.resetting') : t('Настраиваем Hysteria и Xray')
								<p> (connection and connection.error) or message or t('Обычно это занимает несколько секунд. Можно закрыть окно — сервер продолжит работу.')
								<p.retry-time> t('Следующая автоматическая попытка: {time}', {time: connection.nextAttemptAt}) if connection and connection.nextAttemptAt
								if connection and ['retrying','rotation_retry','archive_retry'].includes(connection.state)
									<button.outpost-button.small type="button" disabled=saving @click=retry>
										<outpost-icon name=(saving ? 'spinner-gap' : 'arrow-clockwise')>
										<span> saving ? t('Повторяем…') : t('Повторить сейчас')
					<footer.outpost-modal-footer>
						<div.modal-actions>
							if connection and connection.state == 'ready'
								<button.outpost-button.quiet.rotate-action type="button" disabled=saving @click=rotate>
									<outpost-icon name="arrows-clockwise">
									<span> t('connect.reset')
							<button.outpost-button.quiet type="button" @click=close> t('action.close')

	css self
		display: contents
		.connect-modal w:min(760px,100%)
		.connect-modal .outpost-modal-header bgc:var(--outpost-white)
		.connect-modal .outpost-modal-body d:flex fld:column p:0 of:visible
		.rotate-action mr:auto c:var(--outpost-warning)
		.outpost-modal-footer i.ph-spinner-gap animation: spin 1s linear infinite
		.connect-tabs pos:relative fl:0 0 auto d:flex ai:stretch px:22px bdt:1px solid var(--outpost-line) bdb:1px solid var(--outpost-line) bgc:var(--outpost-white) zi:7
		.connect-tabs button ff:inherit
		.connect-tab pos:relative mih:58px d:flex ai:center g:9px px:16px bd:0 ol:none bgc:transparent c:var(--outpost-muted) fs:12px fw:750 cursor:pointer
		.connect-tab outpost-icon fs:18px
		.connect-tab@hover c:var(--outpost-brand)
		.connect-tab@focus-visible bgc:var(--outpost-brand-soft) c:var(--outpost-brand)
		.connect-tab.active c:var(--outpost-brand)
		.connect-tab.active:after pos:absolute content:'' h:3px l:0 r:0 b:-1px rd:3px 3px 0 0 bgc:var(--outpost-brand)
		.connect-tab.expert margin-inline-start:auto
		.connect-stage fl:1 1 auto miw:0 mih:0 ofy:auto bgc:var(--outpost-white)
		.universal-screen d:grid gtc:190px minmax(0,1fr) ai:center g:30px p:32px
		.universal-qr w:190px d:grid justify-items:center g:9px
		.universal-qr > strong justify-self:center c:var(--outpost-muted) fs:10px fw:650
		.universal-qr .profile-copy-link justify-self:center
		.qr-frame s:190px d:grid jai:center p:9px bd:1px solid var(--outpost-line) rd:12px bgc:var(--outpost-white)
		.qr-frame img s:100% d:block
		.universal-copy miw:0
		.universal-copy h3 m:0 c:var(--outpost-text) fs:21px lh:1.25
		.link-options d:grid gtc:repeat(2,minmax(0,1fr)) g:10px mt:20px
		.link-option d:grid gtc:40px minmax(0,1fr) ai:start g:10px p:13px bd:1px solid var(--outpost-line) rd:10px bgc:color-mix(in srgb,var(--outpost-soft) 72%,var(--outpost-white))
		.link-option-icon s:38px d:grid jai:center bd:1px solid color-mix(in srgb,var(--outpost-brand) 24%,var(--outpost-line)) rd:9px bgc:var(--outpost-white) c:var(--outpost-brand) fs:19px
		.link-option strong d:block c:var(--outpost-text) fs:12px fw:800 lh:1.35
		.link-option p mt:4px c:var(--outpost-muted) fs:10px lh:1.45
		.browser-preview d:inline-flex ai:center g:5px mt:9px c:var(--outpost-brand) fs:9px fw:750 td:none
		.browser-preview@hover td:underline
		.browser-preview@focus-visible ol:2px solid var(--outpost-brand-soft) olo:3px rd:4px
		.browser-preview outpost-icon fs:11px
		.detection-note d:grid gtc:18px minmax(0,1fr) ai:start g:9px mt:20px c:var(--outpost-muted)
		.detection-note outpost-icon mt:1px fs:17px
		.detection-note p fs:10px lh:1.45
		.app-screen miw:0
		.app-toolbar pos:relative d:flex ai:center g:12px p:14px 22px bdb:1px solid var(--outpost-line) zi:5
		.platform-select, .more-picker pos:relative fl:0 0 auto
		.platform-trigger, .more-trigger mih:42px d:flex ai:center g:8px px:12px bd:1px solid var(--outpost-line) rd:9px ol:none bgc:var(--outpost-white) c:var(--outpost-muted) ff:inherit fs:11px fw:750 cursor:pointer
		.platform-trigger@focus-visible, .more-trigger@focus-visible bxs:0 0 0 2px var(--outpost-brand-soft)
		.platform-trigger@hover, .platform-trigger[aria-expanded='true'], .more-trigger@hover, .more-trigger[aria-expanded='true'] border-color:var(--outpost-brand) c:var(--outpost-brand)
		.platform-trigger > outpost-icon@last-child, .more-trigger outpost-icon fs:12px
		.platform-trigger[aria-expanded='true'] > outpost-icon@last-child, .more-trigger[aria-expanded='true'] outpost-icon rotate:180deg
		.platform-select .platform-icon fs:17px c:var(--outpost-brand)
		.picker-popover pos:absolute t:calc(100% + 7px) miw:170px p:6px inset-inline-start:0 bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-white) bxs:0 16px 42px black/15 zi:25
		.more-picker .picker-popover w:245px mah:min(235px,calc(92vh - 280px)) ofy:auto inset-inline-start:auto inset-inline-end:0
		.picker-popover button w:100% d:flex ai:center g:9px mih:36px p:6px 8px bd:0 rd:7px bgc:transparent c:var(--outpost-muted) ff:inherit fs:11px ta:start cursor:pointer
		.picker-popover button@hover, .picker-popover button.active bgc:var(--outpost-soft) c:var(--outpost-brand)
		.picker-popover button > outpost-icon.check margin-inline-start:auto c:var(--outpost-brand)
		.picker-popover button img s:30px rd:8px object-fit:cover
		.picker-popover button span miw:0
		.picker-popover button strong, .picker-popover button small d:block of:hidden tof:ellipsis ws:nowrap
		.picker-popover button strong fs:11px
		.picker-popover button small mt:2px c:var(--outpost-muted) fs:9px
		.app-strip fl:1 1 auto miw:0 d:grid gtc:repeat(3,minmax(0,1fr)) g:6px
		.app-choice miw:0 mih:48px d:grid gtc:36px minmax(0,1fr) ai:center g:8px p:6px 8px bd:1px solid transparent rd:9px bgc:transparent c:var(--outpost-muted) ff:inherit ta:start cursor:pointer
		.app-choice@hover bgc:var(--outpost-soft) c:var(--outpost-text)
		.app-choice.active border-color:color-mix(in srgb,var(--outpost-brand) 20%,transparent) bgc:var(--outpost-brand-soft) c:var(--outpost-brand)
		.app-choice img s:36px rd:10px object-fit:cover bgc:var(--outpost-white)
		.app-choice span miw:0
		.app-choice strong, .app-choice small d:block of:hidden tof:ellipsis ws:nowrap
		.app-choice strong fs:11px fw:800
		.app-choice small mt:2px c:var(--outpost-muted) fs:9px fw:650
		.app-profile d:grid gtc:190px minmax(0,1fr) ai:center g:34px p:30px 46px 34px
		.app-visual w:182px d:grid g:10px
		.app-qr-frame s:182px p:7px
		.profile-qr s:100% d:block
		.profile-copy-link justify-self:center d:inline-flex ai:center g:6px p:0 bd:0 ol:none bgc:transparent c:var(--outpost-brand) ff:inherit fs:11px fw:750 cursor:pointer
		.profile-copy-link@hover td:underline
		.profile-copy-link@focus-visible ol:2px solid var(--outpost-brand-soft)
		.profile-copy-link outpost-icon fs:15px
		.profile-copy miw:0
		.profile-heading d:flex flw:wrap ai:center g:8px
		.profile-heading .app-icon s:38px fl:0 0 38px rd:10px object-fit:cover bgc:var(--outpost-white) bxs:0 3px 10px black/10
		.profile-heading h3 m:0 c:var(--outpost-text) fs:20px
		.app-source-link d:inline-flex ai:center g:4px c:var(--outpost-muted) fs:9px fw:650 td:none
		.app-source-link@hover c:var(--outpost-brand) td:underline
		.app-source-link@focus-visible ol:2px solid var(--outpost-brand-soft) olo:3px rd:4px
		.app-source-link outpost-icon fs:12px
		.profile-copy > p mt:7px maw:500px c:var(--outpost-muted) fs:12px lh:1.5
		.price d:inline-flex px:7px py:4px rd:6px bgc:var(--outpost-success-soft) c:var(--outpost-success) fs:10px fw:750
		.price.paid bgc:var(--outpost-warning-soft) c:var(--outpost-warning)
		.profile-facts d:grid g:7px mt:15px
		.profile-facts span d:flex ai:center g:7px c:var(--outpost-muted) fs:11px
		.profile-facts span em font-style:normal
		.profile-facts span b c:var(--outpost-text) fw:700
		.profile-facts span outpost-icon c:var(--outpost-brand) fs:16px
		.profile-facts span.warning outpost-icon c:var(--outpost-warning)
		.device-actions miw:0 mt:18px bd:1px solid color-mix(in srgb,var(--outpost-brand) 16%,var(--outpost-line)) rd:9px bgc:color-mix(in srgb,var(--outpost-brand-soft) 52%,var(--outpost-white))
		.device-actions summary d:flex ai:center g:8px p:9px 11px c:var(--outpost-muted) fs:9px fw:750 cursor:pointer list-style:none
		.device-actions summary::-webkit-details-marker d:none
		.device-actions summary > outpost-icon margin-inline-start:auto fs:12px tween:transform .16s ease
		.device-actions[open] summary > outpost-icon rotate:180deg
		.device-content p:9px 11px 11px border-top:1px solid color-mix(in srgb,var(--outpost-brand) 12%,var(--outpost-line))
		.device-link, .device-unavailable d:flex ai:center g:8px c:var(--outpost-muted) td:none
		.device-link@hover c:var(--outpost-brand)
		.device-link@focus-visible ol:2px solid var(--outpost-brand-soft) olo:3px rd:4px
		.device-link outpost-icon, .device-unavailable outpost-icon fl:0 0 auto fs:15px
		.device-link span, .device-link strong, .device-link small, .device-unavailable span, .device-unavailable strong, .device-unavailable small d:block
		.device-link strong c:var(--outpost-brand) fs:10px fw:750
		.device-unavailable strong c:var(--outpost-text) fs:10px fw:700
		.device-link small, .device-unavailable small mt:2px c:var(--outpost-muted) fs:8px fw:550
		.technical
			direction: ltr
			unicode-bidi: isolate
		.expert-screen p:36px 46px 42px
		.expert-list d:grid g:9px
		.expert-choice w:100% d:grid gtc:38px minmax(0,1fr) auto ai:center g:13px p:12px 14px bd:1px solid var(--outpost-line) rd:10px bgc:color-mix(in srgb,var(--outpost-soft) 72%,var(--outpost-white)) c:var(--outpost-text) ff:inherit ta:start cursor:pointer tween:border-color .16s ease, background .16s ease, color .16s ease
		.expert-choice@hover border-color:var(--outpost-brand) bgc:var(--outpost-brand-soft)
		.expert-icon s:38px d:grid jai:center bd:1px solid color-mix(in srgb,var(--outpost-brand) 18%,var(--outpost-line)) rd:9px bgc:var(--outpost-white) c:var(--outpost-brand) fs:18px
		.expert-format miw:0
		.expert-format strong, .expert-format small d:block
		.expert-format strong fs:12px fw:800
		.expert-format small mt:4px c:var(--outpost-muted) fs:10px lh:1.4
		.expert-copy d:flex ai:center g:7px c:var(--outpost-brand) fs:11px fw:750 ws:nowrap
		.expert-copy outpost-icon fs:16px
		.expert-copy em font-style:normal
		.activation-state d:grid justify-items:center p:28px 12px ta:center
		.activation-state > outpost-icon c:var(--outpost-brand) fs:44px animation:spin 1s linear infinite
		.activation-state strong mt:18px c:var(--outpost-text) fs:18px
		.activation-state p maw:440px mt:10px c:var(--outpost-muted) fs:14px lh:1.55
		.activation-state .retry-time c:var(--outpost-muted) fs:12px
		.activation-state .outpost-button mt:18px
		.connect-tab@!760 mih:54px px:11px fs:11px
		.universal-screen@!760 gtc:1fr g:25px p:28px 22px justify-items:center
		.universal-qr@!760 w:178px
		.qr-frame@!760 s:178px
		.universal-copy@!760 w:100% maw:520px
		.app-toolbar@!760 flw:wrap p:12px 16px
		.app-strip@!760 order:3 flex-basis:100%; grid-auto-flow:column; grid-template-columns:none; grid-auto-columns:minmax(150px,1fr); overflow-x:auto
		.more-picker@!760 pos:static
		.more-picker .picker-popover@!760 w:auto inset-inline-start:16px inset-inline-end:16px t:calc(100% + 7px)
		.app-profile@!760 gtc:1fr justify-items:center g:22px p:26px 22px ta:center
		.profile-copy@!760 w:100%
		.profile-heading@!760 jc:center
		.profile-facts@!760 justify-items:center
		.device-actions@!760 maw:390px mx:auto ta:left
		.expert-screen@!760 p:28px 22px 32px
		.connect-modal .outpost-modal-body@!760 p:0
		.connect-tabs@!500 px:8px
		.connect-tab@!500 g:6px px:8px fs:10px
		.connect-tab outpost-icon@!500 fs:16px
		.universal-screen@!500 p:22px 16px
		.universal-copy h3@!500 fs:19px
		.link-options@!500 gtc:1fr

tag outpost-archive-modal
	store = null
	saving = false

	def archive
		return unless store.selected
		saving = true
		try
			await store.mutate('DELETE', "/api/v1/connections/{store.selected.id}")
			store.close!
		finally
			saving = false

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('Архивирование подключения') tabindex="-1" @click.self=store.close>
		<div.outpost-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark.danger><outpost-icon name="archive">
				<div>
					<h2> t('Архивировать подключение?')
					<p> t('Ссылка сразу перестанет работать.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> t('«{name}» исчезнет из активного списка. Credentials будут удалены из протоколов, а история останется в журнале.', {name: store.selected and store.selected.name})
				if store.error
					<div.outpost-error> store.error
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button.danger type="button" disabled=saving @click=archive> saving ? t('Архивируем…') : t('Архивировать')

	css
		.outpost-error margin-top: 14px

tag outpost-confirm-modal
	store = null
	saving = false
	error = null

	get payload
		return store.selected.payload if store.selected and store.selected.payload
		{service: store.selected.name}

	def confirm
		saving = true
		error = null
		try
			const action = store.confirmation.action
			const operation = await store.api('POST', '/api/v1/operations/confirm', {confirmationId: store.confirmation.confirmationId, action: action, payload: payload})
			if action == 'update.apply'
				let completed = false
				for attempt in [0 ... 180]
					await new Promise(do(resolve) setTimeout(resolve, 750))
					try
						const response = await window.fetch('/healthz', {cache: 'no-store', signal: window.AbortSignal.timeout(3000)})
						if response.ok
							const state = await response.json!
							if state.version == payload.version
								completed = true
								break
					catch
						continue
				throw new Error(t('settings.update.restart_wait')) unless completed
			elif action == 'engine.update' or action.startsWith('service.')
				let completed = false
				const limit = action == 'engine.update' ? 240 : 60
				for attempt in [0 ... limit]
					await new Promise(do(resolve) setTimeout(resolve, 500))
					const state = await store.api('GET', '/api/v1/operations')
					const current = state.operations.find do(item) item.id == operation.id
					if current and current.status == 'completed'
						completed = true
						break
					throw new Error(current.error or t('Операция завершилась ошибкой')) if current and current.status == 'failed'
				throw new Error(t('Операция выполняется дольше ожидаемого')) unless completed
			await store.load!
			if action == 'engine.update' or action.startsWith('service.')
				store.data.system = await store.api('GET', '/api/v1/system')
			store.close!
		catch issue
			error = issue.message
		finally
			saving = false
			imba.commit!

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=store.confirmation.preview.title tabindex="-1" @click.self=store.close>
		<div.outpost-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="check-circle">
				<div>
					<h2> store.confirmation.preview.title
					<p> t('Подтвердите выполнение операции.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> store.confirmation.preview.changes[0]
				if error
					<div.outpost-error [mt:16px]> error
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button type="button" disabled=saving @click=confirm> t('action.confirm')

tag outpost-code-editor
	syntax = 'yaml'
	change = null
	view = null

	def mount
		const update = EditorView.updateListener.of do(transaction)
			return unless transaction.docChanged
			data = transaction.state.doc.toString!
			change(data) if change
			imba.commit!
		const checker = syntax == 'json' ? jsonParseLinter! : diagnostics
		view = new EditorView({
			doc: data or ''
			parent: self
			extensions: [
				basicSetup
				EditorState.tabSize.of(2)
				indentUnit.of('  ')
				keymap.of([indentWithTab])
				syntax == 'json' ? json! : yaml!
				linter(checker, {delay: 180})
				lintGutter!
				EditorView.contentAttributes.of({'aria-label': t('Редактор конфигурации {format}', {format: syntax == 'json' ? 'JSON' : 'YAML'})})
				update
			]
		})

	def unmount
		view.destroy! if view

	<self>

	css self
		d:block bd:1px solid var(--outpost-line) rd:11px bgc:white of:hidden

global css
	outpost-code-editor
		.cm-editor h:clamp(220px, 45vh, 420px) bgc:white c:var(--outpost-text) fs:13px
		.cm-editor.cm-focused outline:none
		.cm-scroller of:auto lh:1.55 font-family:"SFMono-Regular", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-variant-ligatures:none
		.cm-content, .cm-line font-family:inherit
		.cm-gutters bgc:var(--outpost-soft) c:#8A97AD border-right:1px solid var(--outpost-line)
		.cm-activeLine, .cm-activeLineGutter bgc:#F4F7FC
		.cm-content p:12px 0
		.cm-line px:12px
		.cm-matchingBracket bgc:#E6EEFF c:var(--outpost-brand) ol:1px solid #9FC0F7 rd:3px
		.cm-nonmatchingBracket bgc:#FFF0F0 c:#C43228
		.cm-lintRange-error, .cm-lintPoint-error text-decoration-color:#D63C32
		.cm-tooltip-lint p:9px 11px fs:12px

tag outpost-engine-modal
	store = null
	engine = ''
	template = ''
	preset = null
	preview = null
	busy = false
	checking = false
	show = false
	stamp = 0

	def setup
		engine = store.selected.engine
		preset = store.selected.preset
		template = preset and ['available','conflict'].includes(preset.status) ? preset.template : store.selected.template

	def mount
		check!

	def unmount
		stamp++

	get waiting? do busy or checking
	get changed? do !waiting? and preview and preview.valid and preview.diff != t('Без изменений')
	get blocked? do !changed?
	get lines do (preview and preview.diff or '').split('\n')

	def edit value
		template = value
		check!

	def check
		const current = ++stamp
		checking = true
		show = false
		imba.commit!
		await new Promise do(resolve) window.setTimeout(resolve, 350)
		return if current != stamp
		try
			const result = await store.api('POST', '/api/v1/engines/configurations/preview', {engine: engine, template: template})
			preview = result if current == stamp
		catch issue
			preview = {valid: false, errors: [issue.message]} if current == stamp
		finally
			if current == stamp
				checking = false
				imba.commit!

	def diff
		return unless changed?
		show = true

	def apply
		return unless changed?
		stamp++
		busy = true
		checking = false
		try
			preview = await store.api('POST', '/api/v1/engines/configurations/preview', {engine: engine, template: template})
			return if !preview.valid
			await store.api('POST', '/api/v1/engines/configurations/apply', {engine: engine, template: template})
			await store.load!
			store.close!
		catch issue
			preview = {valid: false, errors: [issue.message]}
		finally
			busy = false
			imba.commit!

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('Конфигурация прокси-движка') tabindex="-1" @click.self=store.close>
		<div.outpost-modal.engine-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="code">
				<div>
					<h2> t('Конфигурация {engine}', {engine: engine == 'xray' ? 'Xray' : 'Hysteria 2'})
					<p> t('Проверка шаблона выполняется во время ввода.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				if preset and preset.status == 'conflict'
					<div.outpost-error.editor-error aria-live="polite">
						<strong> t('Новый системный пресет пересекается с пользовательскими изменениями.')
						<span> preset.conflicts.map(do(item) item.path).join(', ')
				elif preset and preset.status == 'invalid'
					<div.outpost-error.editor-error aria-live="polite"> preset.errors.join('\n')
				elif preset and preset.status == 'available'
					<div.validation-state.validation-ok>
						<outpost-icon name="git-merge">
						<span> t('Пользовательские изменения совмещены с новым системным пресетом.')
				<div.outpost-field.raw-field>
					<div.editor-head>
						<span> t('Шаблон')
						<small> t('{format} · Enter сохраняет отступ · Tab — 2 пробела', {format: engine == 'xray' ? 'JSON' : 'YAML'})
					<outpost-code-editor bind=template syntax=(engine == 'xray' ? 'json' : 'yaml') change=(do(value) edit(value))>
				if checking
					<div.validation-state.validation-checking aria-live="polite">
						<outpost-icon name="spinner-gap">
						<span> t('Проверяем конфигурацию…')
				elif preview
					if preview.valid
						<div.validation-state.validation-ok>
							<outpost-icon name="check-circle">
							<span> t('Синтаксис и защищённые блоки корректны')
					else
						<div.outpost-error.editor-error aria-live="polite"> preview.errors.join('\n')
			<footer.outpost-modal-footer>
				<div.modal-actions.engine-actions>
					<button.outpost-button.secondary.diff-button type="button" disabled=!changed? @click=diff> t('Показать diff')
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button type="button" disabled=blocked? @click=apply> t('Применить')
		if show
			<div.diff-backdrop @click.self=(show = false)>
				<div.outpost-modal.diff-modal role="dialog" aria-modal="true" aria-labelledby="engine-diff-title">
					<header.outpost-modal-header>
						<span.outpost-modal-mark><outpost-icon name="git-diff">
						<div>
							<h2#engine-diff-title> t('Изменения конфигурации')
							<p> t('Сравнение с текущей активной конфигурацией')
						<button.outpost-modal-close type="button" @click=(show = false) aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						<pre.engine-diff>
							for line in lines
								<span.diff-line .removed=(line.startsWith('- ')) .added=(line.startsWith('+ '))> line or ' '
					<footer.outpost-modal-footer>
						<div.modal-actions>
							<button.outpost-button type="button" @click=(show = false)> t('Закрыть')

	css
		.engine-modal width: min(980px, calc(100vw - 40px))
		.raw-field display: grid; gap: 8px
		.editor-head d:flex ai:center jc:space-between g:18px
		.editor-head > span c:var(--outpost-text) fs:13px fw:650
		.editor-head small c:var(--outpost-muted) fs:11px fw:500
		.validation-state d:flex ai:center g:8px mt:14px lh:1 white-space:nowrap
		.validation-state > i s:16px d:grid ja:center fl:0 0 16px fs:16px lh:1
		.validation-state span d:block lh:1.35
		.validation-checking c:var(--outpost-muted)
		.validation-checking > i animation:spin 1s linear infinite
		.validation-ok color: #159447
		.editor-error mt:14px white-space:pre-wrap
		.engine-actions .diff-button mr:auto
		.engine-actions button@disabled pe:none cursor:default tween:none
		.diff-backdrop pos:fixed inset:0 zi:220 d:grid place-items:center p:24px bgc:black/24 backdrop-filter:blur(3px)
		.diff-modal w:min(760px, calc(100vw - 48px))
		.engine-diff mah:min(56vh, 520px) m:0 py:10px of:auto rd:9px bgc:#0E172B c:#DDE7F7 font:12px/1.55 "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace white-space:pre
		.diff-line d:block miw:max-content px:16px py:2px
		.diff-line.removed bgc:red5/18 c:red1
		.diff-line.added bgc:green5/18 c:green1
		@media(max-width: 680px)
			.editor-head ai:flex-start fld:column g:4px
			.validation-state span white-space:normal
			.engine-actions flw:wrap
			.engine-actions .diff-button w:100% mr:0

tag outpost-backup-modal
	store = null
	locked = true
	password = ''
	repeat = ''
	busy = false
	error = null

	get valid?
		!locked or (password.length >= 12 and password.length <= 200 and password == repeat)

	def exportBackup
		return unless valid?
		busy = true
		error = null
		try
			const name = "outpost-{crypto.randomUUID!}.{locked ? 'age' : 'tar'}"
			const output = "/var/lib/outpost/backups/{name}"
			const payload = locked ? {output: output, passphrase: password} : {output: output}
			const preview = await store.api('POST', '/api/v1/operations/preview', {action: 'backup.export', payload: payload})
			const operation = await store.api('POST', '/api/v1/operations/confirm', {confirmationId: preview.confirmationId, action: 'backup.export', payload: payload})
			for attempt in [0 .. 59]
				await new Promise(do(resolve) setTimeout(resolve, 500))
				const state = await store.api('GET', '/api/v1/operations')
				const current = state.operations.find(do(item) item.id == operation.id)
				if current and current.status == 'completed'
					await store.load!
					window.location.assign("/api/v1/backups/{name}")
					store.close!
					return
				throw new Error(current.error or t('Не удалось создать резервную копию')) if current and current.status == 'failed'
			throw new Error(t('Резервная копия создаётся дольше ожидаемого. Проверьте операции в Системе.'))
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('Экспорт резервной копии') tabindex="-1" @click.self=store.close>
		<form.outpost-modal @submit.prevent=exportBackup>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="download-simple">
				<div>
					<h2> t('Экспорт резервной копии')
					<p> t('Настройки, ключи и данные подключений.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> t('Архив содержит настройки, ключи доступа, подключения, маршруты и историю. Сертификаты и файлы движков не включаются.')
				<label.protect>
					<input type="checkbox" bind=locked autofocus>
					<span>
						<strong> t('Защитить копию паролем')
						<small> t('Рекомендуется: в архиве находятся ключи и данные подключений.')
				if locked
					<div.modal-form>
						<label.outpost-field>
							<span> t('Пароль')
							<input type="password" bind=password autocomplete="new-password" placeholder=t('Не менее 12 символов')>
						<label.outpost-field>
							<span> t('Повторите пароль')
							<input type="password" bind=repeat autocomplete="new-password">
				elif !locked
					<div.backup-warning>
						<outpost-icon name="warning-circle">
						<span> t('Копия без пароля не зашифрована. Любой, у кого окажется файл, сможет получить доступ к её содержимому.')
				if locked and password and password.length < 12
					<div.outpost-error> t('Минимум 12 символов')
				elif locked and repeat and password != repeat
					<div.outpost-error> t('Пароли не совпадают')
				elif error
					<div.outpost-error role="alert"> error
				elif busy
					<p.modal-status aria-live="polite"> locked ? t('Создаём зашифрованную копию…') : t('Создаём резервную копию…')
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button type="submit" disabled=(busy or !valid?)> busy ? t('Создаём…') : t('Создать и скачать')

	css self
		.protect d:grid gtc:20px minmax(0,1fr) ai:start g:11px mt:22px p:14px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-soft) cur:pointer
		.protect input s:18px mt:1px accent-color:var(--outpost-brand)
		.protect strong, .protect small d:block
		.protect strong c:var(--outpost-text) fs:14px fw:700
		.protect small mt:5px c:var(--outpost-muted) fs:12px fw:500 lh:1.4
		.modal-form mt:16px
		.modal-form input bd:1px solid blue2 bgc:var(--outpost-white) bxs:0 1px 2px black/5
		.modal-form input@focus bc:var(--outpost-brand) bxs:0 0 0 3px blue1
		.outpost-error mt:14px
		.backup-warning d:grid gtc:20px minmax(0,1fr) ai:start g:10px mt:16px p:12px 14px rd:10px bgc:var(--outpost-soft) c:var(--outpost-muted) fs:12px lh:1.45
		.backup-warning outpost-icon mt:1px c:var(--outpost-warning) fs:18px
		.modal-status mt:16px c:var(--outpost-muted) fs:13px

tag outpost-restore-modal
	store = null

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('Восстановление из резервной копии') tabindex="-1" @click.self=store.close>
		<div.outpost-modal.restore-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="upload-simple">
				<div>
					<h2> t('Восстановление из копии')
					<p> t('Восстановление выполняется на чистом сервере.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> t('Резервная копия восстанавливает доступ владельца, ключи, подключения и маршруты. Поэтому её можно загрузить только на чистый сервер — до настройки доступа.')
				<div.restore-note>
					<strong> t('На этом сервере восстановление заблокировано')
					<span> t('Так активные ключи и подключения нельзя случайно заменить из панели.')
				<pre> 'outpostctl restore /path/to/backup.age'
				<p.help> t('Если копия защищена, на новом сервере команда запросит пароль, а после проверки запустит все службы.')
			<footer.outpost-modal-footer>
				<div.modal-actions><button.outpost-button type="button" @click=store.close> t('Понятно')

	css self
		.restore-modal w:min(620px,100%)
		.restore-note mt:20px p:14px 16px rd:10px bgc:#FFF7E8 c:#754900
		.restore-note strong, .restore-note span d:block
		.restore-note span mt:5px fs:13px lh:1.45
		pre mt:18px p:13px 15px rd:9px bgc:#101A2D c:#E7EDF7 fs:13px white-space:pre-wrap
		.help mt:14px c:var(--outpost-muted) fs:13px lh:1.45

tag outpost-domain-modal
	store = null

	def reload
		store.selected = {payload: {}}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'nginx.reload', payload: {}})
		store.open('confirm')

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('Домен и TLS') tabindex="-1" @click.self=store.close>
		<div.outpost-modal.domain-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="globe">
				<div>
					<h2> t('Домен и TLS')
					<p> t('Публичный адрес и сертификат сервера.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> t('Публичный адрес задаётся при установке сервера. Здесь можно проверить текущую конфигурацию Nginx и перечитать её без остановки прокси-движков.')
				<div.domain-facts>
					<div><span> t('Домен'); <strong.technical> store.data.system.domain
					<div><span> 'TLS'; <strong.success> store.data.system.tls.status == 'valid' ? t('Действителен') : t('Требует проверки')
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('Закрыть')
					<button.outpost-button type="button" @click=reload> t('Проверить Nginx')

	css self
		.domain-modal w:min(620px,100%)
		.domain-facts mt:22px bd:1px solid var(--outpost-line) rd:10px of:hidden
		.domain-facts > div mih:58px d:flex ai:center jc:space-between g:20px p:0 15px bdt:1px solid var(--outpost-line) c:var(--outpost-muted) fs:14px
		.domain-facts > div@first-child bdt:0
		.domain-facts strong c:var(--outpost-text)
		.domain-facts strong.success c:var(--outpost-success)

tag outpost-token-modal
	store = null
	name = 'Codex MCP'
	access = 'manage'
	created = null
	busy = false
	copied = false

	get permissions
		return ['status:read','traffic:read','connections:read','routes:read','operations:read','system:read'] if access == 'read'
		['status:read','traffic:read','connections:read','connections:write','connections:secret','connections:rotate','routes:read','routes:write','operations:read','operations:write','system:read']

	get summary
		return t('Приложение или ИИ с этим токеном сможет просматривать состояние, трафик, подключения, маршруты и операции.') if access == 'read'
		t('Приложение или ИИ с этим токеном сможет просматривать данные, получать секретные ссылки, перевыпускать подключения с подтверждением и управлять маршрутами и операциями.')

	def create
		busy = true
		try
			created = await store.api('POST', '/api/v1/tokens', {
				name: name
				scopes: permissions
			})
			await store.load!
			await store.secure!
		finally
			busy = false
			imba.commit!

	def copy
		await window.navigator.clipboard.writeText(created.token)
		copied = true

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label=t('API-токен') tabindex="-1" @click.self=store.close>
		<div.outpost-modal.token-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark .success=created>
					<outpost-icon name=(created ? 'check' : 'key')>
				<div>
					<h2> created ? t('Токен готов') : t('Создать токен')
					<p> created ? t('Скопируйте токен — после закрытия он исчезнет.') : t('Токен для приложения или автоматизации.')
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			if created
				<div.outpost-modal-body>
					<div.token-label>
						<span> t('Ваш токен')
						<small> t('Показывается один раз')
					<div.token-secret>
						<code> created.token
						<button.token-copy type="button" @click=copy aria-label=(copied ? t('Токен скопирован') : t('Скопировать токен')) title=(copied ? t('Скопировано') : t('Скопировать'))>
							<outpost-icon name=(copied ? 'check' : 'copy')>
					<div.token-reminder.outpost-inline-note>
						<outpost-icon name=(access == 'read' ? 'eye' : 'wrench')>
						<span> summary
				<footer.outpost-modal-footer>
					<div.modal-actions>
						<button.outpost-button type="button" @click=store.close> t('Готово')
			else
				<div.outpost-modal-body>
					<div.modal-form>
						<label.outpost-field>
							<span> t('Название')
							<input bind=name autofocus autocomplete="off" placeholder=t('Например, Codex MCP')>
						<fieldset.access-options>
							<legend> t('Доступ')
							<div.access-grid>
								<label.access-option .selected=(access == 'read')>
									<span.access-icon><outpost-icon name="eye">
									<span.access-copy>
										<strong> t('Только чтение')
										<small> t('Состояние, трафик, подключения и маршруты без изменений')
									<input type="radio" bind=access value="read">
								<label.access-option .selected=(access == 'manage')>
									<span.access-icon><outpost-icon name="wrench">
									<span.access-copy>
										<strong> t('Управление')
										<small> t('Подключения и секретные ссылки, маршруты и подтверждаемые операции')
									<input type="radio" bind=access value="manage">
				<footer.outpost-modal-footer>
					<div.modal-actions>
						<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
						<button.outpost-button type="button" disabled=(busy or !name.trim!) @click=create>
							<outpost-icon name=(busy ? 'spinner-gap' : 'key')>
							<span> busy ? t('Создаём…') : t('Создать токен')

	css self
		.token-modal w:min(540px,100%)
		.token-reminder p:12px 13px rd:10px fs:12px lh:1.45
		.access-options miw:0 m:0 p:0 bd:0
		.access-options legend mb:8px c:var(--outpost-muted) fs:13px fw:650
		.access-grid d:grid gtc:repeat(2,minmax(0,1fr)) g:10px
		.access-option d:grid gtc:34px minmax(0,1fr) 18px ai:start g:10px p:12px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-white) cur:pointer tween:border-color 160ms ease, background-color 160ms ease
		.access-option.selected bc:var(--outpost-brand) bgc:var(--outpost-soft)
		.access-icon s:34px d:grid ja:center rd:9px bgc:var(--outpost-auth-start) c:var(--outpost-brand) fs:16px
		.access-copy strong, .access-copy small d:block
		.access-copy strong c:var(--outpost-text) fs:12px
		.access-copy small mt:4px c:var(--outpost-muted) fs:11px fw:500 lh:1.4
		.access-option input s:17px mt:8px accent-color:var(--outpost-brand)
		.token-label d:flex ai:baseline jc:space-between g:12px mb:8px
		.token-label span c:var(--outpost-text) fs:13px fw:700
		.token-label small c:var(--outpost-muted) fs:11px
		.token-secret d:grid gtc:minmax(0,1fr) 34px ai:center g:8px p:8px 8px 8px 14px bd:1px solid var(--outpost-line) rd:11px bgc:var(--outpost-soft)
		.token-secret code min-width:0 c:var(--outpost-navy) font-family:"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-variant-ligatures:none fs:13px lh:1.45 white-space:nowrap ofx:auto
		.token-copy s:34px d:grid ja:center p:0 bd:1px solid var(--outpost-blue2) rd:9px bgc:var(--outpost-white) c:var(--outpost-brand) cur:pointer tween:background-color 160ms ease, border-color 160ms ease
		.token-copy@hover bgc:var(--outpost-auth-start) bc:var(--outpost-brand)
		.token-copy > i fs:15px
		.token-reminder mt:12px bgc:var(--outpost-auth-start) c:var(--outpost-muted)
		.token-reminder > i c:var(--outpost-brand) fs:16px
		.outpost-modal-footer .outpost-button outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		@media(max-width: 520px)
			.access-grid gtc:1fr
			.token-secret code white-space:normal word-break:break-all
