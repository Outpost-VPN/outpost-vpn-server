import {t} from './i18n.imba'
import {fmt} from './context.imba'

tag matreshka-people
	store = null
	expanded = null
	copied = null
	busy = null

	def open person
		return expanded == person.id if expanded
		store.data.people[0] and store.data.people[0].id == person.id

	def toggle person
		expanded = open(person) ? '__none__' : person.id

	def add person
		store.selected = person
		store.open('device')

	def create
		store.selected = null
		store.open('person')

	def edit person
		store.selected = person
		store.open('person')

	def editdevice device
		store.selected = device
		store.open('device')

	def revoke device
		store.selected = device
		store.open('revoke')

	def copy device
		return if busy
		busy = device.id
		store.error = null
		try
			const invitation = await store.api('POST', "/api/v1/devices/{device.id}/invitations")
			await window.navigator.clipboard.writeText(invitation.url)
			copied = device.id
			imba.commit!
			await new Promise do(resolve)
				window.setTimeout(resolve, 1800)
			copied = null if copied == device.id
		catch issue
			store.error = issue.message
		finally
			busy = null
			imba.commit!

	get deviceCount
		let total = 0
		for person in store.data.people
			total += person.devices.length
		total

	<self>
		<div.page-top>
			<div>
				<span.eyebrow> 'ЛЮДИ И УСТРОЙСТВА'
				<matreshka-header title=t('people.title') subtitle=t('people.subtitle')>
			<button.matreshka-button.small.header-action @click=create>
				<matreshka-icon name="user-plus">
				<span> t('action.invite')
		<div.summary>
			<div>
				<matreshka-icon name="user">
				<span> "{store.data.people.length} человека"
			<span.separator> '·'
			<div>
				<matreshka-icon name="device-mobile">
				<span> "{deviceCount} {fmt.deviceWord(deviceCount)}"
			<span.separator> '·'
			<div>
				<matreshka-icon name="chart-line-up">
				<span> "{fmt.bytes(store.data.traffic.totals.upload + store.data.traffic.totals.download)} {fmt.period(store.trafficPeriod).short}"
		if !store.data.people.length
			<div.empty> t('people.empty')
		else
			<div.people-table>
				<div.table-head>
					<span> 'Человек'
					<span> "Трафик {fmt.period(store.trafficPeriod).short}"
					<span> 'Статус'
					<span> 'Действие'
				for person in store.data.people
					<article.person .expanded=open(person)>
						<div.person-row @click=(do toggle(person))>
							<div.identity>
								<img.avatar src=fmt.avatar(person.avatar) alt="">
								<div>
									<button.name-button type="button" @click.stop=(do edit(person)) aria-label="Редактировать {person.name}"> person.name
									<small> "{person.devices.length} {fmt.deviceWord(person.devices.length)}"
							<div.traffic>
								<strong> fmt.bytes(fmt.personTraffic(person, store.data.traffic))
								<matreshka-sparkline points=fmt.spark(person, store.data.traffic)>
							<span.presence .offline=!fmt.personOnline(person) .pending=(fmt.personPresence(person) == 'Ждёт подключения') title=fmt.signal(person)> fmt.personPresence(person)
							<div.row-actions>
								<button.table-action.person-device-add type="button" @click.stop=add(person) aria-label="Добавить устройство для {person.name}">
									<matreshka-icon name="plus">
									<span> 'Устройство'
								<button.icon-action.disclosure type="button" @click.stop=(do toggle(person)) aria-label=(open(person) ? 'Свернуть устройства' : 'Показать устройства') aria-expanded=open(person)>
									<matreshka-icon name=(open(person) ? 'caret-up' : 'caret-down')>
						if open(person)
							<div.device-list ease>
								for device in person.devices
									<div.device-row>
										<div.device-name>
											<matreshka-device-glyph kind=fmt.deviceKind(device)>
											<div>
												<button.name-button type="button" @click.stop=(do editdevice(device)) aria-label="Редактировать {device.name}"> device.name
												<small> device.client == 'incy' ? 'INCY' : 'Everywhere · Mihomo'
										<div.device-traffic>
											<strong> fmt.bytes(fmt.deviceTraffic(device, store.data.traffic))
											<matreshka-sparkline tone="green" points=fmt.spark(device, store.data.traffic)>
										<span.presence .offline=!fmt.online(device) .pending=(device.status == 'invited') title=fmt.signal(device)> fmt.presence(device)
										<div.device-actions>
											if device.status == 'invited'
												<button.icon-action.link-action type="button" .copied=(copied == device.id) disabled=(busy == device.id) @click.stop=(do copy(device)) aria-label="Создать и скопировать новую ссылку подключения" title=(copied == device.id ? 'Ссылка скопирована' : 'Создать новую ссылку — предыдущая перестанет работать')>
													<matreshka-icon name=(busy == device.id ? 'spinner-gap' : (copied == device.id ? 'check' : 'link-simple'))>
											if device.status != 'revoked'
												<button.icon-action.danger type="button" @click.stop=(do revoke(device)) aria-label=t('action.revoke')>
													<matreshka-icon name="trash">

	css
		.page-top display: flex; align-items: flex-start; justify-content: space-between; gap: 28px
		.eyebrow display: block; margin-bottom: 14px; color: #0B56D9; font-size: 12px; font-weight: 750; letter-spacing: .1em
		.summary display: flex; align-items: center; gap: 18px; margin-top: 34px; color: #69748D; font-size: 15px
		.summary div display: flex; align-items: center; gap: 9px
		.summary matreshka-icon font-size: 22px
		.separator color: #A6B0C0
		.people-table margin-top: 52px
		.table-head, .person-row display: grid; grid-template-columns: minmax(220px, 1.35fr) minmax(190px, 1fr) minmax(130px, .7fr) minmax(150px, .72fr); align-items: center; gap: 16px
		.table-head padding: 0 22px 14px; color: #7C879C; font-size: 13px
		.person margin-bottom: 14px; overflow: hidden; border: 1px solid var(--matreshka-line); border-radius: 12px; background: #fff
		.person-row width: 100%; min-height: 84px; padding: 0 22px; border: 0; outline: none; background: #fff; color: #17213D; text-align: left; cursor: pointer
		.person-row@hover background: var(--matreshka-soft)
		.identity display: flex; align-items: center; gap: 18px; min-width: 0
		.identity small display: block
		.identity small margin-top: 5px; color: #7C879C; font-size: 12px
		.name-button display: inline; padding: 0; border: 0; outline: none; background: transparent; color: #17213D; font-size: 17px; font-weight: 700; text-align: left; transition: color .16s ease
		.name-button@hover color: #0B56D9
		.name-button@focus-visible outline: 2px solid #8EB2EC; outline-offset: 3px; border-radius: 4px
		.avatar width: 50px; height: 50px; display: block; border-radius: 50%; object-fit: cover
		.traffic display: flex; align-items: center; gap: 20px
		.traffic strong min-width: 68px; font-size: 17px
		.presence display: inline-flex; align-items: center; gap: 8px; color: #159447; font-size: 14px
		.presence::before content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor
		.presence.offline color: #8792A6
		.presence.pending color: #E97400
		.row-actions display: flex; align-items: center; justify-content: flex-end; gap: 8px
		.table-action width: 120px; height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid #CBDAF2; border-radius: 8px; background: #F5F9FF; color: #0B56D9; font-size: 12px; font-weight: 650
		.table-action matreshka-icon color: currentColor; font-size: 15px
		.table-action@hover border-color: #9DBCEB; background: #EAF2FF
		.icon-action width: 34px; height: 34px; display: grid; place-items: center; flex: 0 0 34px; padding: 0; border: 1px solid var(--matreshka-line); border-radius: 8px; background: #fff; color: #66738C
		.icon-action matreshka-icon font-size: 16px
		.icon-action@hover border-color: #B8D0F9; background: #F3F7FE; color: #0B56D9
		.icon-action.link-action border-color: #CBDAF2; background: #F5F9FF; color: #0B56D9
		.icon-action.link-action.copied border-color: #B8DEC6; background: #EFFAF2; color: #159447
		.icon-action.link-action matreshka-icon.ph-spinner-gap animation: spin 1s linear infinite
		.icon-action.danger border-color: #F0D0CD; color: #C1453C
		.icon-action.danger@hover border-color: #E7A7A1; background: #FFF0EF; color: #D92D20
		.disclosure matreshka-icon transition: transform .16s ease
		.device-list padding: 0 14px 12px
		.device-list background: var(--matreshka-soft)
		.device-row min-height: 72px; display: grid; grid-template-columns: minmax(220px, 1.35fr) minmax(190px, 1fr) minmax(130px, .7fr) minmax(150px, .72fr); align-items: center; gap: 16px; padding: 0 22px; border-top: 1px solid var(--matreshka-line)
		.device-name display: flex; align-items: center; gap: 15px; min-width: 0
		.device-name .name-button font-size: 15px
		.device-name small display: block
		.device-name small margin-top: 4px; color: #7C879C; font-size: 12px
		.device-traffic display: flex; align-items: center; gap: 18px; font-size: 15px
		.device-traffic strong min-width: 68px
		.device-row > .presence justify-self: start
		.device-actions display: flex; align-items: center; justify-content: flex-end; gap: 8px
		.empty margin-top: 50px; padding: 60px; border: 1px dashed #CAD4E3; border-radius: 14px; color: #69748D; text-align: center
		@media(max-width: 1000px)
			.table-head, .person-row grid-template-columns: minmax(190px, 1.2fr) 1fr 120px 150px
			.device-row grid-template-columns: minmax(190px, 1.2fr) 1fr 120px 150px
			.person-device-add span display: none
			.person-device-add width: 38px; padding: 0
			matreshka-sparkline display: none
		@media(max-width: 720px)
			.page-top align-items: flex-start; flex-direction: column
			.summary flex-wrap: wrap; margin-top: 26px
			.people-table margin-top: 36px
			.table-head display: none
			.person-row grid-template-columns: 1fr auto; gap: 14px; padding: 16px
			.identity grid-column: 1
			.traffic grid-column: 1; padding-left: 68px
			.presence grid-column: 1; padding-left: 68px
			.row-actions grid-column: 2; grid-row: 1 / 4; align-self: center
			.device-row grid-template-columns: 1fr auto; gap: 10px; padding: 12px
			.device-traffic grid-column: 2
			.device-row > .presence grid-column: 1; padding-left: 38px
			.device-actions grid-column: 2; grid-row: 1 / 3
