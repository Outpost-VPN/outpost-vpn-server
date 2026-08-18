import './styles/base.imba'
import './avatar-picker.imba'
import './journal.imba'
import './security.imba'
import './shell.imba'
import './home.imba'
import './people.imba'
import './routes.imba'
import './traffic.imba'
import './proxies.imba'
import './system.imba'
import './dialogs.imba'
import './auth.imba'
import {t} from './i18n.imba'
import {Store} from './store.imba'

const store = new Store

tag App
	get avatar
		(store.data and store.data.settings and store.data.settings.interface and store.data.settings.interface.ownerAvatar) or 'avatar-current'

	def mount
		if window.location.pathname.startsWith('/invite/') or store.path.startsWith('/setup') or store.path.startsWith('/onboarding')
			return
		store.load!

	<self>
		if window.location.pathname.startsWith('/invite/')
			<matreshka-invite-page store=store>
		elif store.path.startsWith('/setup')
			<matreshka-setup store=store>
		elif store.path.startsWith('/onboarding')
			<matreshka-onboarding store=store>
		elif store.path.startsWith('/login')
			<matreshka-login store=store>
		elif store.loading
			<div.loading>
				<matreshka-icon name="spinner-gap">
				<span> t('loading')
		elif store.error and !store.data
			<div.loading><div.matreshka-error> store.error; <button.matreshka-button.small @click=store.load> 'Повторить'
		else
			<matreshka-shell store=store avatar=avatar>
			if store.dialog == 'person'
				<matreshka-person-drawer key=store.dialogKey store=store>
			elif store.dialog == 'device'
				<matreshka-device-drawer key=store.dialogKey store=store>
			elif store.dialog == 'revoke'
				<matreshka-revoke-modal store=store>
			elif store.dialog == 'archive'
				<matreshka-archive-modal key=store.dialogKey store=store>
			elif store.dialog == 'confirm'
				<matreshka-confirm-modal store=store>
			elif store.dialog == 'engine'
				<matreshka-engine-modal store=store>
			elif store.dialog == 'history'
				<matreshka-engine-history store=store>
			elif store.dialog == 'backup'
				<matreshka-backup-modal store=store>
			elif store.dialog == 'restore'
				<matreshka-restore-modal store=store>
			elif store.dialog == 'domain'
				<matreshka-domain-modal store=store>
			elif store.dialog == 'token'
				<matreshka-token-modal store=store>
			elif store.dialog == 'security'
				<matreshka-security-modal store=store>

	css
		.loading min-height: 100vh; display: flex; align-items: center; justify-content: center; gap: 12px; color: #69748D
		.loading > matreshka-icon font-size: 26px; animation: spin 1s linear infinite
		@keyframes spin
			to transform: rotate(360deg)

imba.mount <App>
