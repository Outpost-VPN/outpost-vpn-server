import './styles/base.imba'
import './avatar-picker.imba'
import './journal.imba'
import './security.imba'
import './settings.imba'
import './shell.imba'
import './home.imba'
import './connections.imba'
import './routes.imba'
import './protocols.imba'
import './dialogs.imba'
import './auth.imba'
import {t} from './i18n.imba'
import {Store} from './store.imba'

const store = new Store

tag App
	def mount
		if store.path.startsWith('/setup') or store.path.startsWith('/onboarding')
			return
		store.load!

	<self>
		if store.path.startsWith('/setup')
			<outpost-setup store=store>
		elif store.path.startsWith('/onboarding')
			<outpost-onboarding store=store>
		elif store.path.startsWith('/login')
			<outpost-login store=store>
		elif store.loading
			<div.loading>
				<outpost-icon name="spinner-gap">
				<span> t('loading')
		elif store.error and !store.data
			<div.loading><div.outpost-error> store.error; <button.outpost-button.small @click=store.load> 'Повторить'
		else
			<outpost-shell store=store>
			if store.dialog == 'connection'
				<outpost-connection-modal key=store.dialogKey store=store>
			elif store.dialog == 'connect'
				<outpost-connect-modal key=store.dialogKey store=store>
			elif store.dialog == 'archive'
				<outpost-archive-modal key=store.dialogKey store=store>
			elif store.dialog == 'confirm'
				<outpost-confirm-modal store=store>
			elif store.dialog == 'engine'
				<outpost-engine-modal store=store>
			elif store.dialog == 'history'
				<outpost-engine-history store=store>
			elif store.dialog == 'backup'
				<outpost-backup-modal store=store>
			elif store.dialog == 'restore'
				<outpost-restore-modal store=store>
			elif store.dialog == 'domain'
				<outpost-domain-modal store=store>
			elif store.dialog == 'token'
				<outpost-token-modal key=store.dialogKey store=store>
			elif store.dialog == 'security'
				<outpost-security-modal store=store>

	css
		.loading min-height: 100vh; display: flex; align-items: center; justify-content: center; gap: 12px; color: #69748D
		.loading > outpost-icon font-size: 26px; animation: spin 1s linear infinite
		@keyframes spin
			to transform: rotate(360deg)

imba.mount <App>
