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

const technologies = [
	{id: 'mihomo', name: 'Mihomo', format: 'mihomo', icon: 'circles-four', hint: 'Универсальный YAML-профиль', description: 'Один профиль для клиентов на базе Mihomo и Clash.'}
	{id: 'singbox', name: 'sing-box', format: 'sing-box', icon: 'brackets-curly', hint: 'Структурированный JSON-профиль', description: 'Профиль для официальных и совместимых клиентов sing-box.'}
	{id: 'xray', name: 'Xray', format: 'xray', icon: 'shield-check', hint: 'Подписка VLESS / V2Ray', description: 'Список подключений для клиентов Xray и V2Ray.'}
]

const variants = [
	{id: 'links', name: 'Ссылки VLESS', technology: 'Xray', format: 'links', hint: 'Обычные URI-ссылки', description: 'Готовый список VLESS-ссылок для клиентов с импортом URI.'}
	{id: 'xray', name: 'Для V2Ray-клиентов', technology: 'Xray', format: 'xray', hint: 'Base64-подписка', description: 'Стандартная подписка для большинства клиентов Xray и V2Ray.'}
	{id: 'xray-json', name: 'Полная конфигурация', technology: 'Xray', format: 'xray-json', hint: 'Xray JSON', description: 'Готовая конфигурация для ручного импорта в Xray.'}
]

const platforms = [
	{id: 'ios', label: 'iPhone и iPad'}
	{id: 'macos', label: 'macOS'}
	{id: 'android', label: 'Android'}
	{id: 'windows', label: 'Windows'}
	{id: 'linux', label: 'Linux'}
]

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
		'Название и аватар помогут узнать подключение в списке.'

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
				<div.outpost-modal.connection-modal role="dialog" aria-modal="true" aria-label=(editing? ? 'Редактирование подключения' : 'Новое подключение') @click.stop>
					<header.outpost-modal-header>
						<span.outpost-modal-mark><outpost-icon name=(editing? ? 'pencil-simple' : 'link-simple')>
						<div>
							<h2> editing? ? 'Редактировать подключение' : t('action.addConnection')
							<p> hint
						<button.outpost-modal-close type="button" @click=close aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						<div.connection-form>
							<div.connection-summary>
								<div.connection-avatar>
									<outpost-avatar value=avatar size="104">
									<button.connection-avatar-toggle type="button" @click=toggle aria-expanded=expanded aria-controls="connection-avatar-options">
										<span> expanded ? 'Свернуть' : 'Изменить аватар'
										<outpost-icon name=(expanded ? 'caret-up' : 'caret-down')>
								<label.outpost-field.connection-name>
									<span> t('connections.name')
									<input bind=name placeholder="Например, Мама, Семья или Гости" autofocus required>
							if expanded
								<section.avatar-choice id="connection-avatar-options">
									<span> 'Выберите аватар'
									<outpost-avatar-picker compact=true value=avatar change=(do(value) avatar = value)>
						if store.error
							<div.outpost-error> store.error
					<footer.outpost-modal-footer>
						<div.modal-actions>
							if editing?
								<button.outpost-button.quiet.archive-action type="button" @click=archive>
									<outpost-icon name="archive">
									<span> 'Архивировать'
							<button.outpost-button.quiet type="button" @click=close> t('action.cancel')
							<button.outpost-button type="button" disabled=(saving or !valid?) @click=save>
								<outpost-icon name=(saving ? 'spinner-gap' : 'check')>
								<span> saving ? 'Сохраняем…' : (editing? ? 'Сохранить' : 'Создать подключение')

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
	technology = 'mihomo'
	variant = 'xray'
	expanded = false
	nested = false
	message = null
	polling = false
	copied = null
	saving = false
	closing = false
	visible = false

	get target
		store.selected

	def mount
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
		return unless window.confirm('Старая ссылка перестанет работать сразу. Перевыпустить подключение?')
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
		mode = 'formats'
		technology = item.id
		variant = item.format
		copied = null

	def pick item
		mode = 'formats'
		technology = 'xray'
		variant = item.id
		copied = null

	def reveal value
		mode = value
		expanded = false if value == 'universal'
		nested = false if value == 'universal'
		copied = null
		window.requestAnimationFrame do
			const body = window.document.querySelector('.connect-modal .outpost-modal-body')
			body.scrollTop = 0 if body

	def browse
		expanded = !expanded
		nested = false unless expanded
		copied = null

	def drill
		expanded = true
		nested = !nested
		copied = null

	get subtitle
		return 'Outpost выпускает credentials подключения.' unless connection and connection.state == 'ready'
		return 'Одна ссылка подберёт формат автоматически.' if mode == 'universal'
		'Выберите профиль для конкретного приложения.'

	get option
		return variants.find(do(item) item.id == variant) if technology == 'xray'
		technologies.find do(item) item.id == technology

	get applications
		return [] unless connection and option
		const family = option.technology or option.name
		connection.applications.filter do(app)
			app.technology == family and app.format == option.format and !app.name.startsWith('Другой')

	get profile
		return null unless connection and connection.subscription and option
		connection.subscription.formats[option.format]

	def copy value, key
		return unless value
		await window.navigator.clipboard.writeText(value)
		copied = key
		imba.commit!

	<self>
		<global @keydown.esc=close>
			<div.outpost-modal-backdrop.animated .visible=visible @click.self=close>
				<div.outpost-modal.connect-modal role="dialog" aria-modal="true" aria-label="Подключение" @click.stop>
					<header.outpost-modal-header>
						<span.outpost-modal-mark .success=(connection and connection.state == 'ready')><outpost-icon name=(connection and connection.state == 'ready' ? 'check' : 'spinner-gap')>
						<div>
							<h2> connection and connection.state == 'ready' ? 'Подключение готово' : 'Готовим подключение'
							<p> subtitle
						<button.outpost-modal-close type="button" @click=close aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						if connection and connection.state == 'ready'
							<div.connect-layout>
								<nav.connect-menu aria-label="Способ подключения">
									<button.menu-item.menu-leaf type="button" .active=(mode == 'universal') @click=(do reveal('universal'))>
										<span.menu-icon><outpost-icon name="link-simple">
										<span.menu-copy>
											<strong> 'Универсальная ссылка'
											<small> 'Для большинства случаев'
									<div.menu-group>
										<button.menu-item.menu-parent type="button" .chosen=(mode == 'formats') .open=expanded aria-expanded=expanded @click=browse>
											<span.menu-icon><outpost-icon name="sliders-horizontal">
											<span.menu-copy>
												<strong> 'Конкретный формат'
												<small> 'Ручной выбор профиля'
											<outpost-icon.menu-caret name=(expanded ? 'caret-down' : 'caret-right')>
										if expanded
											<div.menu-children>
												for item in technologies
													if item.id != 'xray'
														<button.menu-item.menu-child type="button" .active=(mode == 'formats' and technology == item.id) @click=(do select(item))>
															<span.menu-icon><outpost-icon name=item.icon>
															<span.menu-copy><strong> item.name
												<button.menu-item.menu-child.menu-parent type="button" .active=(mode == 'formats' and technology == 'xray') .open=nested aria-expanded=nested @click=drill>
													<span.menu-icon><outpost-icon name="shield-check">
													<span.menu-copy><strong> 'Xray'
													<outpost-icon.menu-caret name=(nested ? 'caret-down' : 'caret-right')>
												if nested
													<div.menu-children.nested>
														for item in variants
															<button.menu-item.menu-option type="button" .active=(mode == 'formats' and technology == 'xray' and variant == item.id) @click=(do pick(item))>
																<span.menu-dot>
																<span.menu-copy>
																	<strong> item.name
								<div.connect-content>
									if mode == 'universal'
										<div.connection-ready>
											<div.universal-profile>
												<div.qr-frame><img src=connection.subscription.qrDataUrl alt="Универсальный QR-код подключения">
												<div.universal-copy>
													<span.profile-label> 'ОСНОВНОЙ СПОСОБ'
													<h3> 'Универсальная ссылка'
													<p> 'Камера откроет страницу выбора приложения, а совместимый клиент получит подходящий формат автоматически.'
													<div.profile-buttons>
														<button.outpost-button type="button" @click=(do copy(connection.subscription.url, 'universal'))>
															<outpost-icon name=(copied == 'universal' ? 'check' : 'copy')>
															<span> copied == 'universal' ? 'Скопировано' : 'Скопировать ссылку'
														<a.catalog-link href=connection.subscription.url target="_blank" rel="noreferrer">
															<span> 'Открыть страницу подключения'
															<outpost-icon name="arrow-square-out">
											<div.shared-note>
												<outpost-icon name="info">
												<p> 'Одну ссылку можно использовать на нескольких устройствах. Их активность будет учитываться вместе.'
									elif option and profile
										<div.profile-actions>
											<img.profile-qr src=profile.qrDataUrl alt="QR-код формата {option.name}">
											<div.profile-copy>
												<h3> option.name
												<p> option.description
												<div.platform-list>
													for group in platforms
														let apps = applications.filter do(app) app.platforms.includes(group.id)
														if apps.length
															<div.platform-row>
																<strong> group.label
																<span> apps.map(do(app) app.name).join(', ')
												<div.profile-buttons>
													<button.outpost-button type="button" @click=(do copy(profile.url, option.format))>
														<outpost-icon name=(copied == option.format ? 'check' : 'copy')>
														<span> copied == option.format ? 'Скопировано' : 'Скопировать URL'
						else
							<div.activation-state>
									<outpost-icon name="spinner-gap">
								<strong> connection and ['retrying','rotation_retry','archive_retry'].includes(connection.state) ? 'Не удалось завершить операцию' : connection and connection.state == 'rotating' ? 'Перевыпускаем credentials' : 'Настраиваем Hysteria и Xray'
									<p> (connection and connection.error) or message or 'Обычно это занимает несколько секунд. Можно закрыть окно — сервер продолжит работу.'
									<p.retry-time> "Следующая автоматическая попытка: {connection.nextAttemptAt}" if connection and connection.nextAttemptAt
								if connection and ['retrying','rotation_retry','archive_retry'].includes(connection.state)
										<button.outpost-button.small type="button" disabled=saving @click=retry>
											<outpost-icon name=(saving ? 'spinner-gap' : 'arrow-clockwise')>
											<span> saving ? 'Повторяем…' : 'Повторить сейчас'
					<footer.outpost-modal-footer>
						<div.modal-actions>
							if connection and connection.state == 'ready'
								<button.outpost-button.quiet.rotate-action type="button" disabled=saving @click=rotate>
									<outpost-icon name="arrows-clockwise">
									<span> 'Перевыпустить ссылку'
							<button.outpost-button.quiet type="button" @click=close> t('action.close')

	css self
		display: contents
		.connect-modal w:min(980px,100%) h:min(570px,calc(100vh - 48px))
		.connect-modal .outpost-modal-body fl:1
		.rotate-action mr:auto c:var(--outpost-warning)
		.outpost-modal-footer i.ph-spinner-gap animation: spin 1s linear infinite
		.connect-layout display:grid; grid-template-columns:260px minmax(0,1fr); align-items:start; gap:20px; min-height:330px
		.connect-menu display:grid; gap:4px; padding:7px; border:1px solid var(--outpost-line); border-radius:13px; background:#F4F7FC
		.connect-menu button width:100%; border:0; font:inherit; text-align:left; cursor:pointer
		.menu-item min-width:0; min-height:48px; display:grid; grid-template-columns:28px minmax(0,1fr); align-items:center; gap:9px; padding:7px 9px; border-radius:9px; background:transparent; color:#68758D
		.menu-item@hover background:color-mix(in srgb,var(--outpost-white) 70%,transparent); color:#27334D
		.menu-item.active background:var(--outpost-white); color:#0B56D9; box-shadow:0 2px 8px black/6
		.menu-parent grid-template-columns:28px minmax(0,1fr) 15px
		.menu-parent.chosen color:#0B56D9
		.menu-icon width:28px; height:28px; display:grid; place-items:center; border-radius:8px; background:color-mix(in srgb,var(--outpost-white) 70%,transparent); color:currentColor; font-size:16px
		.menu-item.active .menu-icon background:#E9F1FF
		.menu-copy min-width:0
		.menu-copy strong, .menu-copy small display:block
		.menu-copy strong overflow:hidden; color:currentColor; font-size:12px; font-weight:750; line-height:1.25; text-overflow:ellipsis; white-space:nowrap
		.menu-copy small margin-top:3px; overflow:hidden; color:#8390A6; font-size:9px; font-weight:550; line-height:1.25; text-overflow:ellipsis; white-space:nowrap
		.menu-caret color:#8793A7; font-size:13px
		.menu-group display:grid; gap:3px
		.menu-children display:grid; gap:3px; margin:2px 0 3px 21px; padding-left:9px; border-left:1px solid #D3DEED
		.menu-children.nested margin:2px 0 1px 20px; padding-left:8px
		.menu-child min-height:38px; grid-template-columns:24px minmax(0,1fr); padding:5px 7px
		.menu-child.menu-parent grid-template-columns:24px minmax(0,1fr) 14px
		.menu-child .menu-icon width:24px; height:24px; border-radius:7px; font-size:14px
		.menu-option min-height:34px; grid-template-columns:8px minmax(0,1fr); gap:8px; padding:5px 7px
		.menu-dot width:6px; height:6px; border-radius:50%; background:#AAB5C7
		.menu-option.active .menu-dot background:#0B56D9; box-shadow:0 0 0 3px #DCE9FF
		.connect-content min-width:0
		.connection-ready display: grid; gap: 18px
		.universal-profile display: grid; grid-template-columns: 190px 1fr; align-items: center; gap: 26px; padding: 20px; border: 1px solid #D9E5F7; border-radius: 14px; background: #F7FAFF
		.qr-frame width: 190px; height: 190px; display: grid; place-items: center; padding: 10px; border: 1px solid #DDE6F3; border-radius: 12px; background: #fff
		.qr-frame img width: 100%; height: 100%; display: block
		.universal-copy min-width: 0
		.profile-label display: block; margin-bottom: 9px; color: #0B56D9; font-size: 10px; font-weight: 800; letter-spacing: .09em
		.universal-copy h3 margin: 0 0 8px; color: #17213D; font-size: 21px
		.universal-copy p max-width: 430px; color: #69748D; font-size: 13px; line-height: 1.55
		.shared-note display: flex; align-items: center; gap: 9px; padding: 11px 13px; border-radius: 10px; background: #F4F6FA; color: #66738C
		.shared-note outpost-icon flex: 0 0 auto; font-size: 17px
		.shared-note p font-size: 12px; line-height: 1.45
		.profile-actions display: grid; grid-template-columns: 170px 1fr; align-items: center; gap: 24px; padding: 18px; border-radius: 14px; background: var(--outpost-soft)
		.profile-qr width: 170px; height: 170px; border-radius: 10px; background: #fff
		.profile-actions h3 margin-bottom: 8px; color: #17213D; font-size: 19px
		.profile-actions p color: #69748D; font-size: 13px; line-height: 1.5
		.platform-list display: grid; gap: 5px; margin-top: 14px
		.platform-row display: grid; grid-template-columns: 104px 1fr; gap: 10px; color: #69748D; font-size: 11px; line-height: 1.35
		.platform-row strong color: #42516D; font-weight: 700
		.profile-buttons display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px
		.catalog-link min-height: 40px; display: inline-flex; align-items: center; gap: 7px; padding: 0 8px; color: #0B56D9; font-size: 12px; font-weight: 700; text-decoration: none
		.catalog-link@hover text-decoration: underline
		.catalog-link outpost-icon font-size: 15px
		.activation-state display: grid; justify-items: center; padding: 28px 12px; text-align: center
		.activation-state > outpost-icon color: #0B56D9; font-size: 44px; animation: spin 1s linear infinite
		.activation-state strong margin-top: 18px; color: #17213D; font-size: 18px
		.activation-state p max-width: 440px; margin-top: 10px; color: #69748D; font-size: 14px; line-height: 1.55
		.activation-state .retry-time color: #8792A6; font-size: 12px
		.activation-state .outpost-button margin-top: 18px
		@media(max-width: 760px)
			.connect-layout grid-template-columns:1fr; min-height:0
		@media(max-width: 560px)
			.profile-actions grid-template-columns: 1fr; justify-items: center; text-align: center
			.universal-profile grid-template-columns: 1fr; justify-items: center; text-align: center
			.universal-copy p margin-left: auto; margin-right: auto
			.profile-copy width: 100%
			.platform-row grid-template-columns: 1fr; gap: 2px; text-align: left
			.profile-buttons justify-content: center

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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Архивирование подключения" tabindex="-1" @click.self=store.close>
		<div.outpost-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark.danger><outpost-icon name="archive">
				<div>
					<h2> 'Архивировать подключение?'
					<p> 'Ссылка сразу перестанет работать.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> "«{store.selected and store.selected.name}» исчезнет из активного списка. Credentials будут удалены из протоколов, а история останется в журнале."
				if store.error
					<div.outpost-error> store.error
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button.danger type="button" disabled=saving @click=archive> saving ? 'Архивируем…' : 'Архивировать'

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
			if action == 'engine.update' or action.startsWith('service.')
				let completed = false
				const limit = action == 'engine.update' ? 240 : 60
				for attempt in [0 ... limit]
					await new Promise(do(resolve) setTimeout(resolve, 500))
					const state = await store.api('GET', '/api/v1/operations')
					const current = state.operations.find do(item) item.id == operation.id
					if current and current.status == 'completed'
						completed = true
						break
					throw new Error(current.error or 'Операция завершилась ошибкой') if current and current.status == 'failed'
				throw new Error('Операция выполняется дольше ожидаемого') unless completed
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
					<p> 'Подтвердите выполнение операции.'
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
				EditorView.contentAttributes.of({'aria-label': "Редактор конфигурации {syntax == 'json' ? 'JSON' : 'YAML'}"})
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
	preview = null
	busy = false
	checking = false
	show = false
	stamp = 0

	def setup
		engine = store.selected.engine
		template = store.selected.template

	def mount
		check!

	def unmount
		stamp++

	get waiting? do busy or checking
	get changed? do !waiting? and preview and preview.valid and preview.diff != 'Без изменений'
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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Конфигурация прокси-движка" tabindex="-1" @click.self=store.close>
		<div.outpost-modal.engine-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="code">
				<div>
					<h2> "Конфигурация {engine == 'xray' ? 'Xray' : 'Hysteria 2'}"
					<p> 'Проверка шаблона выполняется во время ввода.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<div.outpost-field.raw-field>
					<div.editor-head>
						<span> 'Шаблон'
						<small> "{engine == 'xray' ? 'JSON' : 'YAML'} · Enter сохраняет отступ · Tab — 2 пробела"
					<outpost-code-editor bind=template syntax=(engine == 'xray' ? 'json' : 'yaml') change=(do(value) edit(value))>
				if checking
					<div.validation-state.validation-checking aria-live="polite">
						<outpost-icon name="spinner-gap">
						<span> 'Проверяем конфигурацию…'
				elif preview
					if preview.valid
						<div.validation-state.validation-ok>
							<outpost-icon name="check-circle">
							<span> 'Синтаксис и защищённые блоки корректны'
					else
						<div.outpost-error.editor-error aria-live="polite"> preview.errors.join('\n')
			<footer.outpost-modal-footer>
				<div.modal-actions.engine-actions>
					<button.outpost-button.secondary.diff-button type="button" disabled=!changed? @click=diff> 'Показать diff'
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button type="button" disabled=blocked? @click=apply> 'Применить'
		if show
			<div.diff-backdrop @click.self=(show = false)>
				<div.outpost-modal.diff-modal role="dialog" aria-modal="true" aria-labelledby="engine-diff-title">
					<header.outpost-modal-header>
						<span.outpost-modal-mark><outpost-icon name="git-diff">
						<div>
							<h2#engine-diff-title> 'Изменения конфигурации'
							<p> 'Сравнение с текущей активной конфигурацией'
						<button.outpost-modal-close type="button" @click=(show = false) aria-label=t('action.close')><outpost-icon name="x">
					<div.outpost-modal-body>
						<pre.engine-diff>
							for line in lines
								<span.diff-line .removed=(line.startsWith('- ')) .added=(line.startsWith('+ '))> line or ' '
					<footer.outpost-modal-footer>
						<div.modal-actions>
							<button.outpost-button type="button" @click=(show = false)> 'Закрыть'

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
				throw new Error(current.error or 'Не удалось создать резервную копию') if current and current.status == 'failed'
			throw new Error('Резервная копия создаётся дольше ожидаемого. Проверьте операции в Системе.')
		catch issue
			error = issue.message
		finally
			busy = false
			imba.commit!

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Экспорт резервной копии" tabindex="-1" @click.self=store.close>
		<form.outpost-modal @submit.prevent=exportBackup>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="download-simple">
				<div>
					<h2> 'Экспорт резервной копии'
					<p> 'Настройки, ключи и данные подключений.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> 'Архив содержит настройки, ключи доступа, подключения, маршруты и историю. Сертификаты и файлы движков не включаются.'
				<label.protect>
					<input type="checkbox" bind=locked autofocus>
					<span>
						<strong> 'Защитить копию паролем'
						<small> 'Рекомендуется: в архиве находятся ключи и данные подключений.'
				if locked
					<div.modal-form>
						<label.outpost-field>
							<span> 'Пароль'
							<input type="password" bind=password autocomplete="new-password" placeholder="Не менее 12 символов">
						<label.outpost-field>
							<span> 'Повторите пароль'
							<input type="password" bind=repeat autocomplete="new-password">
				elif !locked
					<div.backup-warning>
						<outpost-icon name="warning-circle">
						<span> 'Копия без пароля не зашифрована. Любой, у кого окажется файл, сможет получить доступ к её содержимому.'
				if locked and password and password.length < 12
					<div.outpost-error> 'Минимум 12 символов'
				elif locked and repeat and password != repeat
					<div.outpost-error> 'Пароли не совпадают'
				elif error
					<div.outpost-error role="alert"> error
				elif busy
					<p.modal-status aria-live="polite"> locked ? 'Создаём зашифрованную копию…' : 'Создаём резервную копию…'
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
					<button.outpost-button type="submit" disabled=(busy or !valid?)> busy ? 'Создаём…' : 'Создать и скачать'

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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Восстановление из резервной копии" tabindex="-1" @click.self=store.close>
		<div.outpost-modal.restore-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="upload-simple">
				<div>
					<h2> 'Восстановление из копии'
					<p> 'Восстановление выполняется на чистом сервере.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> 'Резервная копия восстанавливает доступ владельца, ключи, подключения и маршруты. Поэтому её можно загрузить только на чистый сервер — до настройки доступа.'
				<div.restore-note>
					<strong> 'На этом сервере восстановление заблокировано'
					<span> 'Так активные ключи и подключения нельзя случайно заменить из панели.'
				<pre> 'outpostctl restore /path/to/backup.age'
				<p.help> 'Если копия защищена, на новом сервере команда запросит пароль, а после проверки запустит все службы.'
			<footer.outpost-modal-footer>
				<div.modal-actions><button.outpost-button type="button" @click=store.close> 'Понятно'

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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="Домен и TLS" tabindex="-1" @click.self=store.close>
		<div.outpost-modal.domain-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark><outpost-icon name="globe">
				<div>
					<h2> 'Домен и TLS'
					<p> 'Публичный адрес и сертификат сервера.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			<div.outpost-modal-body>
				<p> 'Публичный адрес задаётся при установке сервера. Здесь можно проверить текущую конфигурацию Nginx и перечитать её без остановки прокси-движков.'
				<div.domain-facts>
					<div><span> 'Домен'; <strong> store.data.system.domain
					<div><span> 'TLS'; <strong.success> store.data.system.tls.status == 'valid' ? 'Действителен' : 'Требует проверки'
			<footer.outpost-modal-footer>
				<div.modal-actions>
					<button.outpost-button.quiet type="button" @click=store.close> 'Закрыть'
					<button.outpost-button type="button" @click=reload> 'Проверить Nginx'

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
		['status:read','traffic:read','connections:read','connections:write','routes:read','routes:write','operations:read','operations:write','system:read']

	get summary
		return 'Приложение или ИИ с этим токеном сможет просматривать состояние, трафик, подключения, маршруты и операции.' if access == 'read'
		'Приложение или ИИ с этим токеном сможет просматривать данные, создавать и изменять подключения, маршруты и операции.'

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

	<self.outpost-modal-backdrop role="dialog" aria-modal="true" aria-label="API-токен" tabindex="-1" @click.self=store.close>
		<div.outpost-modal.token-modal>
			<header.outpost-modal-header>
				<span.outpost-modal-mark .success=created>
					<outpost-icon name=(created ? 'check' : 'key')>
				<div>
					<h2> created ? 'Токен готов' : 'Создать токен'
					<p> created ? 'Скопируйте токен — после закрытия он исчезнет.' : 'Токен для приложения или автоматизации.'
				<button.outpost-modal-close type="button" @click=store.close aria-label=t('action.close')><outpost-icon name="x">
			if created
				<div.outpost-modal-body>
					<div.token-label>
						<span> 'Ваш токен'
						<small> 'Показывается один раз'
					<div.token-secret>
						<code> created.token
						<button.token-copy type="button" @click=copy aria-label=(copied ? 'Токен скопирован' : 'Скопировать токен') title=(copied ? 'Скопировано' : 'Скопировать')>
							<outpost-icon name=(copied ? 'check' : 'copy')>
					<div.token-reminder.outpost-inline-note>
						<outpost-icon name=(access == 'read' ? 'eye' : 'wrench')>
						<span> summary
				<footer.outpost-modal-footer>
					<div.modal-actions>
						<button.outpost-button type="button" @click=store.close> 'Готово'
			else
				<div.outpost-modal-body>
					<div.modal-form>
						<label.outpost-field>
							<span> 'Название'
							<input bind=name autofocus autocomplete="off" placeholder="Например, Codex MCP">
						<fieldset.access-options>
							<legend> 'Доступ'
							<div.access-grid>
								<label.access-option .selected=(access == 'read')>
									<span.access-icon><outpost-icon name="eye">
									<span.access-copy>
										<strong> 'Только чтение'
										<small> 'Состояние, трафик, подключения и маршруты без изменений'
									<input type="radio" bind=access value="read">
								<label.access-option .selected=(access == 'manage')>
									<span.access-icon><outpost-icon name="wrench">
									<span.access-copy>
										<strong> 'Управление'
										<small> 'Создание и изменение подключений, маршрутов и операций'
									<input type="radio" bind=access value="manage">
				<footer.outpost-modal-footer>
					<div.modal-actions>
						<button.outpost-button.quiet type="button" @click=store.close> t('action.cancel')
						<button.outpost-button type="button" disabled=(busy or !name.trim!) @click=create>
							<outpost-icon name=(busy ? 'spinner-gap' : 'key')>
							<span> busy ? 'Создаём…' : 'Создать токен'

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
