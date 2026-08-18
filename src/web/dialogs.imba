import {basicSetup} from 'codemirror'
import {EditorState} from '@codemirror/state'
import {EditorView, keymap} from '@codemirror/view'
import {indentWithTab} from '@codemirror/commands'
import {indentUnit} from '@codemirror/language'
import {json, jsonParseLinter} from '@codemirror/lang-json'
import {yaml} from '@codemirror/lang-yaml'
import {linter, lintGutter} from '@codemirror/lint'
import {t} from './i18n.imba'
import {deviceTypes, diagnostics, fmt} from './context.imba'

tag matreshka-person-drawer
	store = null
	name = ''
	note = ''
	avatar = 'avatar-1'
	saving = false
	closing = false
	visible = false

	get editing? do !!store.selected

	def setup
		if editing?
			name = store.selected.name
			note = store.selected.note or ''
			avatar = store.selected.avatar or 'avatar-1'

	def mount
		window.requestAnimationFrame do
			const scroller = window.document.querySelector('.person-avatar-grid')
			scroller.scrollTop = 0 if scroller
			window.requestAnimationFrame do
				visible = true
				imba.commit!

	def close
		return if closing
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 380
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'person'
			store.close!
			imba.commit!

	def archive
		return if closing
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 380
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'person'
			store.dialogKey++
			store.dialog = 'archive'
			store.error = null
			imba.commit!

	def save
		return if !name.trim!
		saving = true
		try
			const method = editing? ? 'PATCH' : 'POST'
			const url = editing? ? "/api/v1/people/{store.selected.id}" : '/api/v1/people'
			await store.mutate(method, url, {name: name, note: note, avatar: avatar, color: editing? ? store.selected.color : 'blue'})
			await close!
		finally
			saving = false

	<self>
		<global @keydown.esc=close>
			<div.matreshka-drawer-backdrop .visible=visible @click=close>
				<div.matreshka-drawer-shade>
				<aside.matreshka-drawer.person-drawer role="dialog" aria-modal="true" aria-label=(editing? ? 'Редактирование человека' : 'Добавление человека') @click.stop>
					<header.matreshka-drawer-header>
						<div>
							<span.eyebrow> editing? ? 'ЧЕЛОВЕК' : 'НОВЫЙ ЧЕЛОВЕК'
							<h2> editing? ? 'Редактировать человека' : t('action.invite')
						<button.matreshka-drawer-close type="button" @click=close aria-label=t('action.close')><matreshka-icon name="x">
					<p.intro> editing? ? 'Измените имя, заметку или аватар. Устройства и их подключения останутся прежними.' : 'Создайте человека, а затем добавьте его первое устройство в этой же панели.'
					<div.person-form>
						<label.matreshka-field>
							<span> t('people.name')
							<input bind=name placeholder="Например, Мама" autofocus>
						<label.matreshka-field>
							<span> 'Заметка'
							<textarea bind=note rows="3" placeholder="Например, семейная группа">
						<section.avatar-choice>
							<span> 'Аватар'
							<matreshka-avatar-picker compact=true value=avatar change=(do(value) avatar = value)>
					if store.error
						<div.matreshka-error> store.error
					<footer.matreshka-drawer-footer>
						if editing?
							<button.matreshka-button.quiet.archive-action type="button" @click=archive>
								<matreshka-icon name="archive">
								<span> 'Архивировать'
						<button.matreshka-button.quiet type="button" @click=close> t('action.cancel')
						<button.matreshka-button type="button" disabled=(saving or !name.trim!) @click=save>
							<matreshka-icon name=(saving ? 'spinner-gap' : 'check')>
							<span> saving ? 'Сохраняем…' : (editing? ? 'Сохранить' : 'Создать человека')

	css self
		display: contents
		.intro margin-top: 18px; color: #69748D; font-size: 14px; line-height: 1.55
		.person-form display: grid; gap: 20px; margin-top: 28px
		.person-form textarea resize: vertical
		.avatar-choice > span display: block; margin-bottom: 11px; color: #69748D; font-size: 13px; font-weight: 650
		.avatar-choice matreshka-avatar-picker display:block
		> .matreshka-drawer-backdrop .matreshka-error margin-top: 18px
		.archive-action margin-right: auto; color: #C1453C
		.matreshka-drawer-footer matreshka-icon.ph-spinner-gap animation: spin 1s linear infinite
		@media(max-width: 560px)
			.archive-action span display: none

tag matreshka-device-drawer
	store = null
	name = 'iPhone'
	kind = 'phone'
	platform = 'ios'
	client = 'incy'
	step = 'form'
	copied = false
	saving = false
	closing = false
	visible = false

	get editing? do !!(store.selected and store.selected.person_id)

	get person
		return store.data.people.find(do(item) item.id == store.selected.person_id) if editing?
		store.selected

	def setup
		if editing?
			name = store.selected.name
			kind = store.selected.kind or 'other'
			platform = store.selected.platform or 'unknown'
			client = store.selected.client or 'incy'

	def mount
		window.requestAnimationFrame do
			window.requestAnimationFrame do
				visible = true
				imba.commit!

	def close
		return if closing
		closing = true
		visible = false
		imba.commit!
		const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 1 : 380
		await new Promise do(resolve)
			window.setTimeout(resolve, delay)
		if store.dialog == 'device'
			store.close!
			imba.commit!

	def choose value
		const previous = deviceTypes.find(do(option) option.id == kind)
		const next = deviceTypes.find(do(option) option.id == value) or deviceTypes[5]
		kind = value
		platform = next.platform
		name = next.name if !name.trim! or name == previous.name

	def save
		return if !store.selected or !name.trim!
		saving = true
		try
			if editing?
				await store.mutate('PATCH', "/api/v1/devices/{store.selected.id}", {name: name, kind: kind, platform: platform})
				await close!
			else
				const result = await store.mutate('POST', "/api/v1/people/{store.selected.id}/devices", {name: name, kind: kind, platform: platform, client: client})
				store.invitation = result.invitation
				step = 'invite'
				imba.commit!
		finally
			saving = false

	def copy
		return unless store.invitation
		await window.navigator.clipboard.writeText(store.invitation.url)
		copied = true
		imba.commit!

	<self>
		<global @keydown.esc=close>
			<div.matreshka-drawer-backdrop .visible=visible @click=close>
				<div.matreshka-drawer-shade>
				<aside.matreshka-drawer.device-drawer role="dialog" aria-modal="true" aria-label=(editing? ? 'Редактирование устройства' : 'Добавление устройства') @click.stop>
					if step == 'invite'
						<header.matreshka-drawer-header>
							<div>
								<span.eyebrow> 'УСТРОЙСТВО СОЗДАНО'
								<h2> t('invite.ready')
							<button.matreshka-drawer-close type="button" @click=close aria-label=t('action.close')><matreshka-icon name="x">
						<div.invite-state>
							<div.invite-icon><matreshka-icon name="paper-plane-tilt">
							<p> t('invite.hint')
							<div.invite-url> store.invitation and store.invitation.url
							<div.invite-note>
								<matreshka-icon name="shield-check">
								<span> 'Ссылка одноразовая и предназначена только для этого устройства.'
						<footer.matreshka-drawer-footer>
							<button.matreshka-button.quiet type="button" @click=close> t('action.close')
							<button.matreshka-button type="button" @click=copy>
								<matreshka-icon name=(copied ? 'check' : 'copy')>
								<span> copied ? 'Скопировано' : t('action.copy')
					else
						<header.matreshka-drawer-header>
							<div>
								<span.eyebrow> editing? ? 'УСТРОЙСТВО' : 'НОВОЕ УСТРОЙСТВО · ШАГ 1 ИЗ 2'
								<h2> editing? ? 'Редактировать устройство' : t('device.add')
							<button.matreshka-drawer-close type="button" @click=close aria-label=t('action.close')><matreshka-icon name="x">
						<div.person-context>
							<img.avatar src=fmt.avatar(person and person.avatar) alt="">
							<div>
								<small> 'Владелец устройства'
								<strong> person and person.name
						<section>
							<h3> 'Какое это устройство?'
							<div.type-grid>
								for option in deviceTypes
									<button.type-card type="button" .active=(kind == option.id) @click=(do choose(option.id))>
										<matreshka-device-glyph kind=option.id style="width:50px;height:50px;flex:0 0 50px">
										<span> option.label
						<section>
							<label.matreshka-field>
								<span> t('device.name')
								<input bind=name placeholder="Например, Личный iPhone" autofocus>
							<p.field-hint> 'Название видно только владельцу панели.'
						<div.next-step>
							<matreshka-icon name=(editing? ? 'shield-check' : 'link-simple')>
							<div>
								<strong> editing? ? 'Подключение сохранится' : 'Следующий шаг — персональная ссылка'
								<p> editing? ? 'Изменение названия и типа не пересоздаёт ключи и не прерывает работу устройства.' : 'После создания покажем одноразовое приглашение прямо здесь, не открывая отдельное окно.'
						if store.error
							<div.matreshka-error> store.error
						<footer.matreshka-drawer-footer>
							<button.matreshka-button.quiet type="button" @click=close> t('action.cancel')
							<button.matreshka-button type="button" disabled=(saving or !name.trim!) @click=save>
								<matreshka-icon name=(saving ? 'spinner-gap' : (editing? ? 'check' : 'arrow-right'))>
								<span> saving ? 'Сохраняем…' : (editing? ? 'Сохранить' : 'Создать и продолжить')

	css self
		display: contents
		.person-context min-height: 74px; display: flex; align-items: center; gap: 14px; margin-top: 28px; padding: 12px 15px; border: 1px solid var(--matreshka-line); border-radius: 12px; background: var(--matreshka-soft)
		.person-context .avatar width: 44px; height: 44px; display: block; object-fit: cover; border-radius: 50%
		.person-context small, .person-context strong display: block
		.person-context small margin-bottom: 5px; color: #7C879C; font-size: 11px
		.person-context strong color: #17213D; font-size: 15px
		section margin-top: 30px
		section h3 margin-bottom: 14px; color: #17213D; font-size: 14px
		.type-grid display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px
		.type-card min-height: 84px; display: flex; align-items: center; gap: 12px; padding: 12px; border: 1px solid var(--matreshka-line); border-radius: 11px; background: #fff; color: #4B5872; text-align: left
		.type-card span font-size: 14px; font-weight: 650
		.type-card@hover border-color: #B8D0F9; background: #F8FBFF
		.type-card.active border-color: #0B56D9; background: #F1F6FF; color: #0B56D9; box-shadow: inset 0 0 0 1px #0B56D9
		.field-hint margin-top: 8px; color: #8792A6; font-size: 12px
		.next-step display: flex; align-items: flex-start; gap: 13px; margin-top: 28px; padding: 16px; border-radius: 12px; background: #F2F7FF; color: #315079
		.next-step > matreshka-icon margin-top: 1px; color: #0B56D9; font-size: 22px
		.next-step strong display: block; color: #244266; font-size: 13px
		.next-step p margin-top: 6px; color: #647893; font-size: 12px; line-height: 1.5
		> .matreshka-drawer-backdrop .matreshka-error margin-top: 18px
		.matreshka-drawer-footer matreshka-icon.ph-spinner-gap animation: spin 1s linear infinite
		.invite-state display: grid; justify-items: center; margin-top: 68px; text-align: center
		.invite-icon width: 76px; height: 76px; display: grid; place-items: center; margin-bottom: 24px; border-radius: 50%; background: #EAF1FC; color: #0B56D9
		.invite-icon matreshka-icon font-size: 36px
		.invite-state > p max-width: 390px; color: #69748D; font-size: 15px; line-height: 1.55
		.invite-url width: 100%; margin-top: 26px; padding: 16px; overflow-wrap: anywhere; border: 1px solid var(--matreshka-line); border-radius: 11px; background: #F5F8FC; color: #365078; text-align: left; font: 13px ui-monospace, monospace
		.invite-note display: flex; align-items: center; gap: 10px; margin-top: 18px; color: #667993; font-size: 12px; text-align: left
		.invite-note matreshka-icon color: #159447; font-size: 20px
		@media(max-width: 560px)
			.type-grid grid-template-columns: 1fr 1fr
			.invite-state margin-top: 48px

tag matreshka-revoke-modal
	store = null
	saving = false

	def revoke
		saving = true
		try
			await store.mutate('POST', "/api/v1/devices/{store.selected.id}/revoke")
			store.close!
		finally
			saving = false

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label=t('action.revoke') tabindex="-1" @click.self=store.close>
		<div.matreshka-modal>
			<h2> t('action.revoke')
			<p> "Подписка «{store.selected and store.selected.name}» перестанет работать сразу. Остальные устройства не изменятся."
			<div.modal-actions>
				<button.matreshka-button.quiet @click=store.close> t('action.cancel')
				<button.matreshka-button.danger disabled=saving @click=revoke> t('action.revoke')

tag matreshka-archive-modal
	store = null
	saving = false

	get allowed? do store.selected and store.selected.devices.every(do(device) device.status == 'revoked')

	def archive
		return unless allowed?
		saving = true
		try
			await store.mutate('DELETE', "/api/v1/people/{store.selected.id}")
			store.close!
		finally
			saving = false

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Архивирование человека" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal>
			<h2> 'Архивировать человека?'
			<p> "«{store.selected and store.selected.name}» исчезнет из списка людей. История останется в системе."
			if !allowed?
				<div.archive-warning> 'Сначала отзовите все активные устройства этого человека.'
			if store.error
				<div.matreshka-error> store.error
			<div.modal-actions>
				<button.matreshka-button.quiet type="button" @click=store.close> t('action.cancel')
				<button.matreshka-button.danger type="button" disabled=(saving or !allowed?) @click=archive> saving ? 'Архивируем…' : 'Архивировать'

	css
		.archive-warning margin-top: 18px; padding: 12px 14px; border-radius: 10px; background: #FFF8F1; color: #9A4D00; font-size: 14px; line-height: 1.45
		.matreshka-error margin-top: 14px

tag matreshka-confirm-modal
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
			store.close!
		catch issue
			error = issue.message
		finally
			saving = false
			imba.commit!

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label=store.confirmation.preview.title tabindex="-1" @click.self=store.close>
		<div.matreshka-modal>
			<h2> store.confirmation.preview.title
			<p> store.confirmation.preview.changes[0]
			if error
				<div.matreshka-error [mt:16px]> error
			<div.modal-actions>
				<button.matreshka-button.quiet @click=store.close> t('action.cancel')
				<button.matreshka-button disabled=saving @click=confirm> t('action.confirm')

tag matreshka-code-editor
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
		d:block bd:1px solid var(--matreshka-line) rd:11px bgc:white of:hidden

global css
	matreshka-code-editor
		.cm-editor h:clamp(220px, 45vh, 420px) bgc:white c:var(--matreshka-text) fs:13px
		.cm-editor.cm-focused outline:none
		.cm-scroller of:auto lh:1.55 font-family:"SFMono-Regular", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-variant-ligatures:none
		.cm-content, .cm-line font-family:inherit
		.cm-gutters bgc:var(--matreshka-soft) c:#8A97AD border-right:1px solid var(--matreshka-line)
		.cm-activeLine, .cm-activeLineGutter bgc:#F4F7FC
		.cm-content p:12px 0
		.cm-line px:12px
		.cm-matchingBracket bgc:#E6EEFF c:var(--matreshka-brand) ol:1px solid #9FC0F7 rd:3px
		.cm-nonmatchingBracket bgc:#FFF0F0 c:#C43228
		.cm-lintRange-error, .cm-lintPoint-error text-decoration-color:#D63C32
		.cm-tooltip-lint p:9px 11px fs:12px

tag matreshka-engine-modal
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

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Конфигурация прокси-движка" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal.engine-modal>
			<h2> "Конфигурация {engine == 'xray' ? 'Xray' : 'Hysteria 2'}"
			<p> 'Защищённые блоки подставляет Matreshka. Ошибки проверяются во время ввода.'
			<div.matreshka-field.raw-field>
				<div.editor-head>
					<span> 'Шаблон'
					<small> "{engine == 'xray' ? 'JSON' : 'YAML'} · Enter сохраняет отступ · Tab — 2 пробела"
				<matreshka-code-editor bind=template syntax=(engine == 'xray' ? 'json' : 'yaml') change=(do(value) edit(value))>
			if checking
				<div.validation-state.validation-checking aria-live="polite">
					<matreshka-icon name="spinner-gap">
					<span> 'Проверяем конфигурацию…'
			elif preview
				if preview.valid
					<div.validation-state.validation-ok>
						<matreshka-icon name="check-circle">
						<span> 'Синтаксис и защищённые блоки корректны'
				else
					<div.matreshka-error.editor-error aria-live="polite"> preview.errors.join('\n')
			<div.modal-actions.engine-actions>
				<button.matreshka-button.secondary.diff-button type="button" disabled=!changed? @click=diff> 'Показать diff'
				<button.matreshka-button.quiet type="button" @click=store.close> t('action.cancel')
				<button.matreshka-button type="button" disabled=blocked? @click=apply> 'Применить'
		if show
			<div.diff-backdrop @click.self=(show = false)>
				<div.matreshka-modal.diff-modal role="dialog" aria-modal="true" aria-labelledby="engine-diff-title">
					<header>
						<span.modal-symbol><matreshka-icon name="git-diff">
						<div>
							<h2#engine-diff-title> 'Изменения конфигурации'
							<p> 'Сравнение с текущей активной конфигурацией'
					<pre.engine-diff>
						for line in lines
							<span.diff-line .removed=(line.startsWith('- ')) .added=(line.startsWith('+ '))> line or ' '
					<div.modal-actions>
						<button.matreshka-button type="button" @click=(show = false)> 'Закрыть'

	css
		.engine-modal width: min(980px, calc(100vw - 40px))
		.raw-field display: grid; gap: 8px; margin-top: 20px
		.editor-head d:flex ai:center jc:space-between g:18px
		.editor-head > span c:var(--matreshka-text) fs:13px fw:650
		.editor-head small c:var(--matreshka-muted) fs:11px fw:500
		.validation-state d:flex ai:center g:8px mt:14px lh:1 white-space:nowrap
		.validation-state > i s:16px d:grid ja:center fl:0 0 16px fs:16px lh:1
		.validation-state span d:block lh:1.35
		.validation-checking c:var(--matreshka-muted)
		.validation-checking > i animation:spin 1s linear infinite
		.validation-ok color: #159447
		.editor-error mt:14px white-space:pre-wrap
		.engine-actions .diff-button mr:auto
		.engine-actions button@disabled pe:none cursor:default tween:none
		.diff-backdrop pos:fixed inset:0 zi:220 d:grid place-items:center p:24px bgc:black/24 backdrop-filter:blur(3px)
		.diff-modal w:min(760px, calc(100vw - 48px))
		.diff-modal > header d:flex ai:center g:14px
		.modal-symbol s:46px d:grid ja:center fl:0 0 46px rd:12px bgc:var(--matreshka-auth-start) c:var(--matreshka-brand) fs:23px
		.diff-modal > header p mt:8px c:var(--matreshka-muted) fs:14px lh:1.45
		.engine-diff mah:min(56vh, 520px) mt:22px py:10px of:auto rd:9px bgc:#0E172B c:#DDE7F7 font:12px/1.55 "SFMono-Regular", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace white-space:pre
		.diff-line d:block miw:max-content px:16px py:2px
		.diff-line.removed bgc:red5/18 c:red1
		.diff-line.added bgc:green5/18 c:green1
		@media(max-width: 680px)
			.editor-head ai:flex-start fld:column g:4px
			.validation-state span white-space:normal
			.engine-actions flw:wrap
			.engine-actions .diff-button w:100% mr:0

tag matreshka-backup-modal
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
			const name = "matreshka-{crypto.randomUUID!}.{locked ? 'age' : 'tar'}"
			const output = "/var/lib/matreshka/backups/{name}"
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

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Экспорт резервной копии" tabindex="-1" @click.self=store.close>
		<form.matreshka-modal @submit.prevent=exportBackup>
			<h2> 'Экспорт резервной копии'
			<p> 'Архив содержит настройки, людей, ключи доступа, данные подключений, маршруты и историю. Сертификаты и файлы движков не включаются.'
			<label.protect>
				<input type="checkbox" bind=locked autofocus>
				<span>
					<strong> 'Защитить копию паролем'
					<small> 'Рекомендуется: в архиве находятся ключи и данные подключений.'
			if locked
				<div.modal-form>
					<label.matreshka-field>
						<span> 'Пароль'
						<input type="password" bind=password autocomplete="new-password" placeholder="Не менее 12 символов">
					<label.matreshka-field>
						<span> 'Повторите пароль'
						<input type="password" bind=repeat autocomplete="new-password">
			elif !locked
				<div.backup-warning>
					<matreshka-icon name="warning-circle">
					<span> 'Копия без пароля не зашифрована. Любой, у кого окажется файл, сможет получить доступ к её содержимому.'
			if locked and password and password.length < 12
				<div.matreshka-error> 'Минимум 12 символов'
			elif locked and repeat and password != repeat
				<div.matreshka-error> 'Пароли не совпадают'
			elif error
				<div.matreshka-error role="alert"> error
			elif busy
				<p.modal-status aria-live="polite"> locked ? 'Создаём зашифрованную копию…' : 'Создаём резервную копию…'
			<div.modal-actions>
				<button.matreshka-button.quiet type="button" @click=store.close> t('action.cancel')
				<button.matreshka-button type="submit" disabled=(busy or !valid?)> busy ? 'Создаём…' : 'Создать и скачать'

	css self
		.protect d:grid gtc:20px minmax(0,1fr) ai:start g:11px mt:22px p:14px bd:1px solid var(--matreshka-line) rd:11px bgc:var(--matreshka-soft) cur:pointer
		.protect input s:18px mt:1px accent-color:var(--matreshka-brand)
		.protect strong, .protect small d:block
		.protect strong c:var(--matreshka-text) fs:14px fw:700
		.protect small mt:5px c:var(--matreshka-muted) fs:12px fw:500 lh:1.4
		.modal-form input bd:1px solid blue2 bgc:var(--matreshka-white) bxs:0 1px 2px black/5
		.modal-form input@focus bc:var(--matreshka-brand) bxs:0 0 0 3px blue1
		.backup-warning d:grid gtc:20px minmax(0,1fr) ai:start g:10px mt:16px p:12px 14px rd:10px bgc:var(--matreshka-soft) c:var(--matreshka-muted) fs:12px lh:1.45
		.backup-warning matreshka-icon mt:1px c:var(--matreshka-warning) fs:18px
		.modal-status mt:16px c:var(--matreshka-muted) fs:13px

tag matreshka-restore-modal
	store = null

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Восстановление из резервной копии" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal.restore-modal>
			<span.modal-symbol><matreshka-icon name="upload-simple">
			<h2> 'Восстановление из копии'
			<p> 'Резервная копия восстанавливает владельца, ключи, людей, подписки и маршруты. Поэтому её можно загрузить только на чистый сервер — до создания владельца.'
			<div.restore-note>
				<strong> 'На этом сервере восстановление заблокировано'
				<span> 'Так активные ключи и подключения нельзя случайно заменить из панели.'
			<pre> 'matreshkactl restore /path/to/backup.age'
			<p.help> 'Если копия защищена, на новом сервере команда запросит пароль, а после проверки запустит все службы.'
			<div.modal-actions><button.matreshka-button type="button" @click=store.close> 'Понятно'

	css self
		.restore-modal w:min(620px,100%)
		.modal-symbol s:46px d:grid ja:center mb:18px rd:12px bgc:var(--matreshka-auth-start) c:var(--matreshka-brand) fs:23px
		.restore-note mt:20px p:14px 16px rd:10px bgc:#FFF7E8 c:#754900
		.restore-note strong, .restore-note span d:block
		.restore-note span mt:5px fs:13px lh:1.45
		pre mt:18px p:13px 15px rd:9px bgc:#101A2D c:#E7EDF7 fs:13px white-space:pre-wrap
		.help mt:14px c:var(--matreshka-muted) fs:13px lh:1.45

tag matreshka-domain-modal
	store = null

	def reload
		store.selected = {payload: {}}
		store.confirmation = await store.api('POST', '/api/v1/operations/preview', {action: 'nginx.reload', payload: {}})
		store.open('confirm')

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="Домен и TLS" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal.domain-modal>
			<h2> 'Домен и TLS'
			<p> 'Публичный адрес задаётся при установке сервера. Здесь можно проверить текущую конфигурацию Nginx и перечитать её без остановки прокси-движков.'
			<div.domain-facts>
				<div><span> 'Домен'; <strong> store.data.system.domain
				<div><span> 'TLS'; <strong.success> store.data.system.tls.status == 'valid' ? 'Действителен' : 'Требует проверки'
			<div.modal-actions>
				<button.matreshka-button.quiet type="button" @click=store.close> 'Закрыть'
				<button.matreshka-button type="button" @click=reload> 'Проверить Nginx'

	css self
		.domain-modal w:min(620px,100%)
		.domain-facts mt:22px bd:1px solid var(--matreshka-line) rd:10px of:hidden
		.domain-facts > div mih:58px d:flex ai:center jc:space-between g:20px p:0 15px bdt:1px solid var(--matreshka-line) c:var(--matreshka-muted) fs:14px
		.domain-facts > div@first-child bdt:0
		.domain-facts strong c:var(--matreshka-text)
		.domain-facts strong.success c:var(--matreshka-success)

tag matreshka-token-modal
	store = null
	name = 'Codex MCP'
	created = null
	busy = false
	copied = false

	def create
		busy = true
		try
			created = await store.api('POST', '/api/v1/tokens', {
				name: name
				scopes: ['status:read','traffic:read','people:read','people:write','routes:read','routes:write','operations:read','operations:write','system:read']
			})
			await store.load!
			await store.secure!
		finally
			busy = false
			imba.commit!

	def copy
		await window.navigator.clipboard.writeText(created.token)
		copied = true

	<self.matreshka-modal-backdrop role="dialog" aria-modal="true" aria-label="MCP-доступ" tabindex="-1" @click.self=store.close>
		<div.matreshka-modal>
			<h2> 'MCP-доступ'
			if created
				<p> 'Токен показывается один раз. Сохраните его в менеджере секретов локального компьютера.'
				<div.invite-url> created.token
				<pre.mcp-command> "MATRESHKA_URL={window.location.origin}\nMATRESHKA_TOKEN=••••••\nmatreshkactl mcp"
				<div.modal-actions>
					<button.matreshka-button.quiet @click=store.close> t('action.close')
					<button.matreshka-button @click=copy> copied ? 'Скопировано' : 'Скопировать токен'
			else
				<p> 'Токен сможет читать состояние и трафик, управлять людьми, устройствами и маршрутами. Опасные операции всё равно потребуют preview и confirmation.'
				<div.modal-form>
					<label.matreshka-field> 'Название'; <input bind=name>
				<div.modal-actions>
					<button.matreshka-button.quiet @click=store.close> t('action.cancel')
					<button.matreshka-button disabled=(busy or !name.trim!) @click=create> 'Создать один раз'

	css
		.mcp-command margin-top: 14px; padding: 14px; border-radius: 9px; background: var(--matreshka-soft); color: #365078; font: 13px/1.6 ui-monospace, monospace
