import {t} from './i18n.imba'
import {fmt} from './context.imba'

tag outpost-connections
	store = null
	open = []
	popup = null
	above = false
	busy = null

	def use connection
		store.selected = connection
		store.open('connect')

	def create
		store.selected = null
		store.open('connection')

	def edit connection
		close!
		store.selected = connection
		store.open('connection')

	def remove connection
		close!
		store.selected = connection
		store.open('archive')

	def pause connection
		close!
		busy = connection.id
		try
			await store.mutate('POST', "/api/v1/connections/{connection.id}/suspend", {})
		finally
			busy = null
			imba.commit!

	def resume connection
		close!
		busy = connection.id
		try
			await store.mutate('POST', "/api/v1/connections/{connection.id}/resume", {})
		finally
			busy = null
			imba.commit!

	def close
		popup = null
		above = false

	def actions connection, event
		if popup == connection.id
			close!
			return
		popup = connection.id
		above = false
		imba.commit!
		const root = event.currentTarget.closest('.connection-menu')
		return unless root
		const layer = root.querySelector('menu')
		return unless layer
		const trigger = event.currentTarget.getBoundingClientRect!
		const height = layer.offsetHeight
		above = trigger.bottom + height + 8 > window.innerHeight and trigger.top > height + 8
		imba.commit!

	def shown connection
		open.includes(connection.id)

	def toggle connection
		const id = connection.id
		open = shown(connection) ? open.filter(do(value) value != id) : open.concat(id)

	get online
		store.data.connections.filter(do(connection) fmt.connectionOnline(connection)).length

	def connectionword count
		const mod10 = count % 10
		const mod100 = count % 100
		return t('подключение') if mod10 == 1 and mod100 != 11
		return t('подключения') if mod10 >= 2 and mod10 <= 4 and (mod100 < 12 or mod100 > 14)
		t('подключений')

	def activity connection
		return t('connection.suspended') if connection.suspended_at
		return t('Готовим подключение') if connection.status == 'provisioning'
		return t('Перевыпускаем ссылку') if connection.status == 'rotating'
		return t('Архивируем') if connection.status == 'archiving'
		return t('Онлайн') if fmt.connectionOnline(connection)
		return t('Активность неизвестна') if connection.presence == 'unknown'
		fmt.seen(connection)

	def traffic connection
		fmt.connectionTrafficRow(connection, store.data.traffic)

	def received connection
		const row = traffic(connection)
		return [] unless row and row.series
		row.series.map do(point) point.download

	def sent connection
		const row = traffic(connection)
		return [] unless row and row.series
		row.series.map do(point) point.upload

	def trend connection
		const row = traffic(connection)
		return [] unless row and row.series
		row.series.map do(point) point.upload + point.download

	def total connection
		const row = traffic(connection)
		row ? row.upload + row.download : 0

	<self>
		<div.page-top>
			<div>
				<span.eyebrow> t('ПОДКЛЮЧЕНИЯ')
				<outpost-header title=t('connections.title') subtitle=t('connections.subtitle')>
			<button.outpost-button.small.header-action @click=create>
				<outpost-icon name="plus">
				<span> t('action.addConnection')
		<div.summary>
			<div>
				<outpost-icon name="identification-card">
				<span> "{store.data.connections.length} {connectionword(store.data.connections.length)}"
			<span.separator> '·'
			<div>
				<span.online-dot aria-hidden="true">
				<span> t('{count} онлайн', {count: online})
			<span.separator> '·'
			<div>
				<outpost-icon name="chart-line-up">
				<span> "{fmt.bytes(store.data.traffic.totals.upload + store.data.traffic.totals.download)} {fmt.period(store.trafficPeriod).short}"
		if !store.data.connections.length
			<div.empty> t('connections.empty')
		else
			<div.connection-table>
				<div.table-head>
					<span aria-hidden="true">
					<span> t('Общий трафик')
					<span> t('Всего {period}', {period: fmt.period(store.trafficPeriod).short})
					<span> t('Действия')
				for connection in store.data.connections
					<article.connection key=connection.id .expanded=shown(connection)>
						<div.connection-row @click=(do toggle(connection))>
							<button.expand type="button" @click.stop=(do toggle(connection)) aria-label=(shown(connection) ? t('Свернуть') : t('Показать статистику')) aria-expanded=shown(connection)>
								<outpost-icon name=(shown(connection) ? 'caret-down' : 'caret-right')>
							<div.identity>
								<outpost-avatar value=connection.avatar size="48">
								<div>
									<button.name-button type="button" @click.stop=(do edit(connection)) aria-label=t('Редактировать {name}', {name: connection.name})> connection.name
									<small.connection-state .online=fmt.connectionOnline(connection) .paused=!!connection.suspended_at .pending=(connection.presence == 'unknown' or connection.status != 'active')> activity(connection)
							<div.trend>
								<outpost-line-chart points=trend(connection) mini=true tone="neutral">
							<div.traffic>
								<strong> fmt.bytes(total(connection))
								<small>
									<span.received> "↓ {fmt.bytes(traffic(connection)..download or 0)}"
									<span.sent> "↑ {fmt.bytes(traffic(connection)..upload or 0)}"
							<div.row-actions>
								<button.table-action.primary type="button" disabled=!!connection.suspended_at @click.stop=(do use(connection))>
									<outpost-icon name=(connection.status == 'active' ? 'qr-code' : 'spinner-gap')>
									<span> t('Подписка')
								<div.connection-menu .open=(popup == connection.id) .above=above>
									<button.menu-trigger type="button" @click.stop=(do(e) actions(connection, e)) aria-label=t('connection.actions') title=t('connection.actions') aria-haspopup="menu" aria-expanded=(popup == connection.id)>
										<outpost-icon name="dots-three">
									if popup == connection.id
										<global @click.capture.outside=close @keydown.esc=close>
										<menu @click.stop>
											if connection.suspended_at
												<button type="button" disabled=(busy == connection.id) @click=(do resume(connection))>
													<outpost-icon name="play">
													<span> t('connection.resume')
											else
												<button type="button" disabled=(busy == connection.id) @click=(do pause(connection))>
													<outpost-icon name="pause">
													<span> t('connection.suspend')
											<button type="button" @click=(do edit(connection))>
												<outpost-icon name="pencil-simple">
												<span> t('connection.edit')
											<button.danger type="button" @click=(do remove(connection))>
												<outpost-icon name="trash">
												<span> t('connection.delete')
						if shown(connection)
							<div.connection-details ease>
								<div.detail-chart>
									<outpost-line-chart points=received(connection) secondary=sent(connection) edge=false>
									<div.chart-legend>
										<div.received><i>; <span> t('Получено {amount}', {amount: fmt.bytes(traffic(connection)..download or 0)})
										<div.sent><i>; <span> t('Отправлено {amount}', {amount: fmt.bytes(traffic(connection)..upload or 0)})

	css self
		d:block
		.page-top d:flex ai:flex-start jc:space-between g:28px
		.eyebrow d:block mb:14px c:var(--outpost-brand) fs:12px fw:750 ls:.1em
		.summary d:flex ai:center g:18px mt:34px c:var(--outpost-muted) fs:15px
		.summary div d:flex ai:center g:9px
		.summary outpost-icon fs:22px
		.summary .online-dot s:8px fl:0 0 8px d:block rd:full bgc:var(--outpost-success)
		.separator c:color-mix(in srgb,var(--outpost-muted) 55%,transparent)
		.connection-table mt:48px
		.table-head, .connection-row d:grid gtc:28px minmax(220px,1.15fr) minmax(130px,.7fr) minmax(145px,.62fr) minmax(140px,.58fr) ai:center g:14px
		.table-head px:20px pb:13px c:var(--outpost-muted) fs:12px
		.table-head span@first-child gc:1 / 3
		.table-head span@last-child ta:right
		.connection pos:relative mb:12px bd:1px solid var(--outpost-line) rd:13px bgc:var(--outpost-white) tween:border-color .16s ease, background .16s ease
		.connection@hover bc:blue3
		.connection-row miw:0 mih:86px px:20px rd:12px bgc:transparent cursor:pointer tween:background .16s ease
		.connection-row bgc@hover:color-mix(in srgb,var(--outpost-auth-start) 46%,var(--outpost-white))
		.connection.expanded .connection-row rdb:0
		.connection.expanded .connection-row bgc@hover:transparent
		.expand s:28px d:grid jai:center p:0 bd:1px solid var(--outpost-line) rd:7px bgc:var(--outpost-white) c:var(--outpost-muted) tween:border-color .16s ease, background .16s ease, color .16s ease
		.connection-row@hover .expand bc:#B8D0F9 bgc:#F3F7FE c:var(--outpost-brand)
		.identity d:flex ai:center g:16px miw:0
		.identity > div miw:0
		.name-button d:inline p:0 bd:0 ol:none bgc:transparent c:var(--outpost-text) fs:16px fw:750 ta:left
		.name-button c@hover:var(--outpost-brand)
		.name-button@focus-visible ol:2px solid color-mix(in srgb,var(--outpost-brand) 45%,transparent) olo:3px rd:4px
		.connection-state d:flex ai:center g:7px mt:6px c:var(--outpost-muted) fs:11px ws:nowrap
		.connection-state::before content:'' s:7px fl:0 0 7px d:block rd:full bgc:currentColor
		.connection-state.online c:var(--outpost-success)
		.connection-state.pending c:var(--outpost-warning)
		.connection-state.paused c:var(--outpost-warning)
		.trend w:100% h:28px of:hidden
		.trend > outpost-line-chart w:100% h:28px
		.traffic d:flex fld:column ai:flex-start g:5px miw:0
		.traffic strong c:var(--outpost-text) fs:15px
		.traffic small d:flex g:10px c:var(--outpost-muted) fs:10px fw:600 ws:nowrap
		.traffic small .received c:var(--outpost-brand)
		.traffic small .sent c:var(--outpost-warning)
		.row-actions d:flex ai:center jc:flex-end g:8px
		.table-action mih:38px d:inline-flex jai:center g:8px px:14px bd:1px solid var(--outpost-line) rd:9px bgc:var(--outpost-white) c:var(--outpost-muted) fs:12px fw:700 ws:nowrap
		.table-action bg@hover:var(--outpost-soft) c@hover:var(--outpost-brand)
		.table-action@disabled o:.55 pe:none
		.table-action.primary bc:color-mix(in srgb,var(--outpost-brand) 25%,var(--outpost-line)) bgc:var(--outpost-brand-soft) c:var(--outpost-brand)
		.table-action outpost-icon fs:16px
		.table-action outpost-icon.ph-spinner-gap animation:spin 1s linear infinite
		.connection-menu pos:relative fl:0 0 auto
		.menu-trigger s:38px d:grid jai:center p:0 bd:1px solid var(--outpost-line) rd:9px bgc:var(--outpost-white) c:var(--outpost-muted) cur:pointer
		.menu-trigger bgc@hover:var(--outpost-soft) c@hover:var(--outpost-brand)
		.connection-menu.open .menu-trigger bc:color-mix(in srgb,var(--outpost-brand) 30%,var(--outpost-line)) c:var(--outpost-brand)
		.connection-menu menu pos:absolute t:calc(100% + 7px) r:0 zi:20 miw:190px d:grid g:3px m:0 p:6px bd:1px solid var(--outpost-line) rd:10px bgc:var(--outpost-white) bxs:0 14px 36px black/12 of:hidden list-style:none
		.connection-menu.above menu t:auto b:calc(100% + 7px)
		.connection-menu menu button w:100% d:grid gtc:18px 1fr ai:center g:9px p:9px 10px bd:0 rd:7px bgc:transparent c:var(--outpost-text) fs:12px fw:650 ta:left ws:nowrap
		.connection-menu menu button bgc@hover:var(--outpost-soft) c@hover:var(--outpost-brand)
		.connection-menu menu button@disabled o:.5 pe:none
		.connection-menu menu button.danger c:var(--outpost-danger)
		.connection-menu outpost-icon fs:16px
		.connection-details min-height:168px p:14px 22px 16px 52px bdt:1px solid var(--outpost-line) bgc:color-mix(in srgb,var(--outpost-soft) 44%,white) ease:180ms cubic-bezier(.22,1,.36,1) o@off:0 y@off:-4px
		.detail-chart d:grid g:10px c:var(--outpost-brand)
		.detail-chart > outpost-line-chart h:112px
		.chart-legend d:flex ai:center jc:flex-end g:24px c:var(--outpost-muted) fs:10px
		.chart-legend > div d:flex ai:center g:7px ws:nowrap
		.chart-legend > div > span c:color-mix(in srgb,var(--outpost-text) 72%,var(--outpost-muted)) fs:11px fw:650 ws:nowrap
		.chart-legend i s:7px d:block rd:full bgc:var(--outpost-brand)
		.chart-legend .sent i bgc:var(--outpost-warning)
		.empty mt:50px p:60px bd:1px dashed var(--outpost-line) rd:14px c:var(--outpost-muted) ta:center
		@media(max-width: 980px)
			.table-head, .connection-row gtc:28px minmax(190px,1fr) minmax(110px,.55fr) minmax(125px,.55fr) minmax(130px,.55fr)
		@media(max-width: 760px)
			.page-top fld:column
			.summary flw:wrap mt:25px
			.connection-table mt:34px
			.table-head d:none
			.connection-row gtc:28px 1fr auto py:16px
			.identity gc:2
			.trend d:none
			.traffic gc:2
			.row-actions gc:3 gr:1 / 3
			.connection-details px:20px
		@media(max-width: 540px)
			.connection-row gtc:28px 1fr
			.row-actions gc:2 gr:auto jc:flex-start
			.chart-legend flw:wrap
