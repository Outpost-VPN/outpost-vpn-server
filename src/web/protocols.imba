import {t} from './i18n.imba'

tag outpost-protocols
	store = null

	<self>
		<outpost-header title=t('nav.protocols') subtitle=t('methods.page_hint')>
		<outpost-method-list store=store>

	css self
		d:block maw:1110px
		outpost-method-list d:block mt:32px
