import {t} from './i18n.imba'

# The owner supplies ordered items, domain moves, restoration and persistence.
export class Reorder
	owner = null
	drag = null
	over = null
	origin = null
	gesture = null
	cancelled = null
	motions = {}

	def constructor host
		owner = host

	def touch id, e
		return if cancelled == e
		cancelled = null
		return unless owner.movable(id)
		unless drag
			drag = id
			gesture = e
			origin = owner.ordered.map do(item) item.id
		const target = hit(e.clientY)
		if target
			over = target.id
			move(drag, target.id, target.after)
		if e.ended?
			origin = null
			owner.persist!
			end!

	def step id, delta
		return if drag
		return unless owner.movable(id)
		const items = owner.ordered
		const from = items.findIndex do(item) item.id == id
		const target = items[from + delta]
		return unless target and owner.movable(target.id)
		move(id, target.id, delta > 0)
		owner.persist!

	def rows do owner.querySelectorAll('[data-reorder-id]')

	def hit y
		for row in rows!
			const rect = row.getBoundingClientRect!
			if y >= rect.top and y <= rect.bottom
				return {id: row.getAttribute('data-reorder-id'), after: y > rect.top + rect.height / 2}
		null

	def move source, target, after
		return if source == target
		const positions = {}
		for row in rows!
			positions[row.getAttribute('data-reorder-id')] = row.getBoundingClientRect!.top
		owner.move(source, target, after)
		imba.commit!
		window.requestAnimationFrame do
			return if window.matchMedia('(prefers-reduced-motion: reduce)').matches
			for row in rows!
				const id = row.getAttribute('data-reorder-id')
				if id != source and positions[id] != undefined
					const offset = positions[id] - row.getBoundingClientRect!.top
					if Math.abs(offset) > .5
						motions[id].cancel! if motions[id]
						motions[id] = row.animate([{transform: "translateY({offset}px)"}, {transform: 'translateY(0)'}], {duration: 180, easing: 'cubic-bezier(.22,1,.36,1)'})

	def end
		owner.restore(origin) if origin
		drag = null
		gesture = null
		over = null
		origin = null
		imba.commit!

	def cancel
		cancelled = gesture
		end!

tag outpost-reorder-handle
	order = null
	item = null
	disabled = false
	label = ''
	icon = 'dots-six-vertical'

	def key e
		if e.key == 'ArrowUp' or e.key == 'ArrowDown'
			e.preventDefault!
			order.step(item.id, e.key == 'ArrowUp' ? -1 : 1)

	<self>
		<button type="button" disabled=disabled @touch.moved(5px,'y')=order.touch(item.id,e) @keydown=key title=(label or t('methods.drag')) aria-label=(label or t('methods.drag'))>
			<outpost-icon name=icon>
	css self
		d:inline-flex
		button s:28px d:grid ja:center p:0 bd:0 rd:7px bgc:transparent c:var(--outpost-muted) fs:18px cursor:grab touch-action:none user-select:none
		button@hover bgc:var(--outpost-soft)
		button@active cursor:grabbing
		button@disabled cursor:default bgc:transparent o:.45
