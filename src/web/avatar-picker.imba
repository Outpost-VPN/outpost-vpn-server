const avatarCatalog = [
	{id: 'avatar-current', sex: 'male', age: 'young', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-1', sex: 'male', age: 'young', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-2', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-3', sex: 'male', age: 'adult', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-4', sex: 'male', age: 'senior', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-5', sex: 'male', age: 'senior', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-6', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-7', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-8', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-9', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-10', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-11', sex: 'male', age: 'young', glasses: false, facial: 'stubble', hair: 'shaved'}
	{id: 'avatar-12', sex: 'male', age: 'young', glasses: true, facial: 'stubble', hair: 'balding'}
	{id: 'avatar-13', sex: 'male', age: 'young', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-14', sex: 'male', age: 'young', glasses: true, facial: 'moustache', hair: 'shaved'}
	{id: 'avatar-15', sex: 'male', age: 'young', glasses: false, facial: 'beard', hair: 'balding'}
	{id: 'avatar-16', sex: 'male', age: 'young', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-17', sex: 'male', age: 'young', glasses: false, facial: 'full', hair: 'shaved'}
	{id: 'avatar-18', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'balding'}
	{id: 'avatar-19', sex: 'male', age: 'adult', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-20', sex: 'male', age: 'adult', glasses: false, facial: 'none', hair: 'shaved'}
	{id: 'avatar-21', sex: 'male', age: 'adult', glasses: true, facial: 'stubble', hair: 'balding'}
	{id: 'avatar-22', sex: 'male', age: 'adult', glasses: false, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-23', sex: 'male', age: 'adult', glasses: true, facial: 'moustache', hair: 'shaved'}
	{id: 'avatar-24', sex: 'male', age: 'adult', glasses: false, facial: 'moustache', hair: 'balding'}
	{id: 'avatar-25', sex: 'male', age: 'adult', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-26', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'shaved'}
	{id: 'avatar-27', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'balding'}
	{id: 'avatar-28', sex: 'male', age: 'mature', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-29', sex: 'male', age: 'mature', glasses: true, facial: 'none', hair: 'shaved'}
	{id: 'avatar-30', sex: 'male', age: 'mature', glasses: false, facial: 'stubble', hair: 'balding'}
	{id: 'avatar-31', sex: 'male', age: 'mature', glasses: true, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-32', sex: 'male', age: 'mature', glasses: false, facial: 'moustache', hair: 'shaved'}
	{id: 'avatar-33', sex: 'male', age: 'mature', glasses: true, facial: 'beard', hair: 'balding'}
	{id: 'avatar-34', sex: 'male', age: 'mature', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-35', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'shaved'}
	{id: 'avatar-36', sex: 'male', age: 'mature', glasses: false, facial: 'full', hair: 'balding'}
	{id: 'avatar-37', sex: 'male', age: 'senior', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-38', sex: 'male', age: 'senior', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-39', sex: 'male', age: 'senior', glasses: false, facial: 'stubble', hair: 'shaved'}
	{id: 'avatar-40', sex: 'male', age: 'senior', glasses: true, facial: 'moustache', hair: 'shaved'}
	{id: 'avatar-41', sex: 'male', age: 'senior', glasses: false, facial: 'moustache', hair: 'balding'}
	{id: 'avatar-42', sex: 'male', age: 'senior', glasses: true, facial: 'beard', hair: 'balding'}
	{id: 'avatar-43', sex: 'male', age: 'senior', glasses: false, facial: 'beard', hair: 'shaved'}
	{id: 'avatar-44', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'balding'}
	{id: 'avatar-45', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-46', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-47', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-48', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-49', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-50', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-51', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-52', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-53', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-54', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-55', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-56', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-57', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-58', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-59', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-60', sex: 'male', age: 'young', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-61', sex: 'male', age: 'young', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-62', sex: 'male', age: 'young', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-63', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-64', sex: 'male', age: 'adult', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-65', sex: 'male', age: 'adult', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-66', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-67', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-68', sex: 'male', age: 'mature', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-69', sex: 'male', age: 'mature', glasses: true, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-70', sex: 'male', age: 'mature', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-71', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-72', sex: 'male', age: 'senior', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-73', sex: 'male', age: 'senior', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-74', sex: 'male', age: 'senior', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-75', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-76', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-77', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-78', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-79', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-80', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-81', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-82', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-83', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-84', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-85', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-86', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-87', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-88', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-89', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-90', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-91', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-92', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-93', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-94', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-95', sex: 'male', age: 'young', glasses: false, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-96', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-97', sex: 'male', age: 'adult', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-98', sex: 'male', age: 'adult', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-99', sex: 'male', age: 'mature', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-100', sex: 'male', age: 'mature', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-101', sex: 'male', age: 'senior', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-102', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-103', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-104', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-105', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-106', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-107', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-108', sex: 'female', age: 'young', glasses: false}
	{id: 'avatar-109', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-110', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-111', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-112', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-113', sex: 'female', age: 'young', glasses: true}
	{id: 'avatar-114', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-115', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-116', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-117', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-118', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-119', sex: 'female', age: 'adult', glasses: false}
	{id: 'avatar-120', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-121', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-122', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-123', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-124', sex: 'female', age: 'adult', glasses: true}
	{id: 'avatar-125', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-126', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-127', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-128', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-129', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-130', sex: 'female', age: 'mature', glasses: false}
	{id: 'avatar-131', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-132', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-133', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-134', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-135', sex: 'female', age: 'mature', glasses: true}
	{id: 'avatar-136', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-137', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-138', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-139', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-140', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-141', sex: 'female', age: 'senior', glasses: false}
	{id: 'avatar-142', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-143', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-144', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-145', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-146', sex: 'female', age: 'senior', glasses: true}
	{id: 'avatar-147', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-148', sex: 'male', age: 'young', glasses: false, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-149', sex: 'male', age: 'young', glasses: true, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-150', sex: 'male', age: 'young', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-151', sex: 'male', age: 'young', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-152', sex: 'male', age: 'young', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-153', sex: 'male', age: 'young', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-154', sex: 'male', age: 'young', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-155', sex: 'male', age: 'young', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-156', sex: 'male', age: 'young', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-157', sex: 'male', age: 'young', glasses: true, facial: 'none', hair: 'shaved'}
	{id: 'avatar-158', sex: 'male', age: 'young', glasses: false, facial: 'full', hair: 'shaved'}
	{id: 'avatar-159', sex: 'male', age: 'young', glasses: true, facial: 'stubble', hair: 'shaved'}
	{id: 'avatar-160', sex: 'male', age: 'young', glasses: false, facial: 'full', hair: 'balding'}
	{id: 'avatar-161', sex: 'male', age: 'young', glasses: true, facial: 'none', hair: 'balding'}
	{id: 'avatar-162', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-163', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-164', sex: 'male', age: 'adult', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-165', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-166', sex: 'male', age: 'adult', glasses: false, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-167', sex: 'male', age: 'adult', glasses: true, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-168', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-169', sex: 'male', age: 'adult', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-170', sex: 'male', age: 'adult', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-171', sex: 'male', age: 'adult', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-172', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'shaved'}
	{id: 'avatar-173', sex: 'male', age: 'adult', glasses: true, facial: 'beard', hair: 'shaved'}
	{id: 'avatar-174', sex: 'male', age: 'adult', glasses: false, facial: 'full', hair: 'balding'}
	{id: 'avatar-175', sex: 'male', age: 'adult', glasses: true, facial: 'none', hair: 'balding'}
	{id: 'avatar-176', sex: 'male', age: 'adult', glasses: false, facial: 'full', hair: 'balding'}
	{id: 'avatar-177', sex: 'male', age: 'mature', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-178', sex: 'male', age: 'mature', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-179', sex: 'male', age: 'mature', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-180', sex: 'male', age: 'mature', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-181', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-182', sex: 'male', age: 'mature', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-183', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-184', sex: 'male', age: 'mature', glasses: false, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-185', sex: 'male', age: 'mature', glasses: true, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-186', sex: 'male', age: 'mature', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-187', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'shaved'}
	{id: 'avatar-188', sex: 'male', age: 'mature', glasses: false, facial: 'stubble', hair: 'shaved'}
	{id: 'avatar-189', sex: 'male', age: 'mature', glasses: true, facial: 'moustache', hair: 'shaved'}
	{id: 'avatar-190', sex: 'male', age: 'mature', glasses: false, facial: 'none', hair: 'balding'}
	{id: 'avatar-191', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'balding'}
	{id: 'avatar-192', sex: 'male', age: 'senior', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-193', sex: 'male', age: 'senior', glasses: true, facial: 'none', hair: 'hair'}
	{id: 'avatar-194', sex: 'male', age: 'senior', glasses: false, facial: 'full', hair: 'hair'}
	{id: 'avatar-195', sex: 'male', age: 'senior', glasses: true, facial: 'stubble', hair: 'hair'}
	{id: 'avatar-196', sex: 'male', age: 'senior', glasses: false, facial: 'moustache', hair: 'hair'}
	{id: 'avatar-197', sex: 'male', age: 'senior', glasses: true, facial: 'beard', hair: 'hair'}
	{id: 'avatar-198', sex: 'male', age: 'senior', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-199', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-200', sex: 'male', age: 'senior', glasses: false, facial: 'none', hair: 'hair'}
	{id: 'avatar-201', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'shaved'}
	{id: 'avatar-202', sex: 'male', age: 'senior', glasses: false, facial: 'stubble', hair: 'shaved'}
	{id: 'avatar-203', sex: 'male', age: 'senior', glasses: true, facial: 'moustache', hair: 'balding'}
	{id: 'avatar-204', sex: 'male', age: 'senior', glasses: false, facial: 'beard', hair: 'balding'}
	{id: 'avatar-205', sex: 'male', age: 'senior', glasses: true, facial: 'beard', hair: 'balding'}
	{id: 'avatar-206', sex: 'male', age: 'young', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-207', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-208', sex: 'male', age: 'young', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-209', sex: 'male', age: 'young', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-210', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-211', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-212', sex: 'male', age: 'adult', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-213', sex: 'male', age: 'adult', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-214', sex: 'male', age: 'mature', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-215', sex: 'male', age: 'mature', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-216', sex: 'male', age: 'mature', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-217', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'hair'}
	{id: 'avatar-218', sex: 'male', age: 'senior', glasses: false, facial: 'beard', hair: 'hair'}
	{id: 'avatar-219', sex: 'male', age: 'senior', glasses: true, facial: 'full', hair: 'hair'}
]

const avatarIds = new Set([...avatarCatalog.map(do(item) item.id), 'avatar-person', 'avatar-group'])
const filters = {
	sex: [{id: 'all', label: 'Все'}, {id: 'male', label: 'Мужчины'}, {id: 'female', label: 'Женщины'}]
	age: [{id: 'all', label: 'Любой'}, {id: 'young', label: 'Молодые'}, {id: 'adult', label: 'Взрослые'}, {id: 'mature', label: 'Зрелые'}, {id: 'senior', label: 'Старшие'}]
	glasses: [{id: 'all', label: 'Неважно'}, {id: 'no', label: 'Без очков'}, {id: 'yes', label: 'В очках'}]
	facial: [{id: 'all', label: 'Любая'}, {id: 'none', label: 'Без'}, {id: 'stubble', label: 'Щетина'}, {id: 'moustache', label: 'Усы'}, {id: 'beard', label: 'Борода'}, {id: 'full', label: 'Борода с усами'}]
	hair: [{id: 'all', label: 'Любые'}, {id: 'hair', label: 'С волосами'}, {id: 'shaved', label: 'Бритая голова'}, {id: 'balding', label: 'Лысина'}]
}

const defaults = [
	{id: 'avatar-person', label: 'Неизвестный человек'}
	{id: 'avatar-group', label: 'Группа людей'}
]

const labels = {
	young: 'Молодой возраст'
	adult: 'Взрослый возраст'
	mature: 'Зрелый возраст'
	senior: 'Старший возраст'
}

export def avatarUrl value
	const id = avatarIds.has(value) ? value : 'avatar-current'
	"/assets/avatars/{id}.avif"

tag outpost-avatar
	value = 'avatar-person'
	size = '48'

	<self style="--avatar-size:{size}px" aria-hidden="true">
		<img src=avatarUrl(value) alt="">

	css self
		s:var(--avatar-size) d:grid jai:center fl:0 0 var(--avatar-size) of:hidden rd:full bgc:var(--outpost-brand-soft)
		img s:100% d:block object-fit:cover

tag outpost-avatar-picker
	value = 'avatar-person'
	busy = false
	change = null
	compact = false
	sex = 'all'
	age = 'all'
	glasses = 'all'
	facial = 'all'
	hair = 'all'

	get filtered
		avatarCatalog.filter do(item)
			return false if sex != 'all' and item.sex != sex
			return false if age != 'all' and item.age != age
			return false if glasses != 'all' and (item.glasses ? 'yes' : 'no') != glasses
			return false if facial != 'all' and item.facial != facial
			return false if hair != 'all' and item.hair != hair
			true

	get choices
		defaults.concat(filtered)

	def set key, value
		self[key] = value
		if key == 'sex' and value != 'male'
			facial = 'all'
			hair = 'all'

	def choose item
		change(item.id) if change and !busy

	def description item
		const sexLabel = item.sex == 'male' ? 'Мужчина' : 'Женщина'
		const glassesLabel = item.glasses ? 'в очках' : 'без очков'
		"{sexLabel}, {labels[item.age]}, {glassesLabel}"

	<self .compact=compact>
		<div.picker-layout>
			<div.filters aria-label="Фильтры аватаров">
				<div.filter-row>
					<strong> 'Пол'
					<div.chips>
						for option in filters.sex
							<button type="button" .active=(sex == option.id) aria-pressed=(sex == option.id) @click=(do set('sex', option.id))> option.label
				<div.filter-row>
					<strong> 'Возраст'
					<div.chips>
						for option in filters.age
							<button type="button" .active=(age == option.id) aria-pressed=(age == option.id) @click=(do set('age', option.id))> option.label
				<div.filter-row>
					<strong> 'Очки'
					<div.chips>
						for option in filters.glasses
							<button type="button" .active=(glasses == option.id) aria-pressed=(glasses == option.id) @click=(do set('glasses', option.id))> option.label
				if sex == 'male'
					<div.filter-row.male-filter>
						<strong> 'Растительность'
						<div.chips>
							for option in filters.facial
								<button type="button" .active=(facial == option.id) aria-pressed=(facial == option.id) @click=(do set('facial', option.id))> option.label
					<div.filter-row.male-filter>
						<strong> 'Волосы'
						<div.chips>
							for option in filters.hair
								<button type="button" .active=(hair == option.id) aria-pressed=(hair == option.id) @click=(do set('hair', option.id))> option.label
			<div.results>
				<div.results-head>
					<strong> "Подходят: {filtered.length}"
					if sex == 'all'
						<span> 'Выберите пол, чтобы открыть дополнительные признаки'
				<div.avatar-grid role="listbox" aria-label="Аватары подключения">
					for item in choices
						<button type="button" role="option" aria-selected=(item.id == value) .selected=(item.id == value) disabled=busy @click=(do choose(item)) aria-label=(item.label or description(item))>
							<img src=avatarUrl(item.id) alt="">
							<span><outpost-icon name="check">

	css self
		d:block
		.picker-layout d:block
		.results min-width:0
		.filters d:grid ac:start g:10px p:14px rd:12px bgc:var(--outpost-soft)
		.filter-row d:grid gtc:112px minmax(0, 1fr) ai:start g:12px
		.filter-row > strong pt:7px c:var(--outpost-muted) fs:11px fw:700
		.chips d:flex g:6px flex-wrap:wrap
		.chips button h:30px px:10px bd:1px solid transparent rd:999px bgc:var(--outpost-white) c:#55637B fs:11px fw:650 cur:pointer tween:background-color 140ms ease, border-color 140ms ease, color 140ms ease, box-shadow 140ms ease
		.chips button@hover bd-c:#B8CEF0 c:var(--outpost-brand)
		.chips button.active bd-c:#AFC8F2 bgc:var(--outpost-auth-start) c:var(--outpost-brand) bxs:0 1px 2px black/4
		.male-filter > strong c:#5B6D89
		.results-head d:flex ai:center jc:space-between g:14px mt:16px mb:10px px:2px
		.results-head strong c:var(--outpost-text) fs:12px
		.results-head span c:var(--outpost-muted) fs:10px ta:right
		.avatar-grid mah:330px d:grid gtc:repeat(10, 64px) gar:64px jc:space-between row-gap:12px column-gap:6px p:4px ofy:auto overscroll-behavior:contain scrollbar-gutter:stable
		.avatar-grid button pos:relative s:64px p:0 bd:0 rd:full bgc:transparent cur:pointer
		.avatar-grid img s:64px d:block rd:full object-fit:cover bgc:var(--outpost-soft)
		.avatar-grid button@hover img bxs:0 0 0 2px #B8D0F9
		.avatar-grid button.selected img bxs:0 0 0 3px var(--outpost-brand)
		.avatar-grid button > span pos:absolute r:-2px b:-2px s:20px d:none jai:center bd:2px solid white rd:full bgc:var(--outpost-brand) c:white fs:10px
		.avatar-grid button.selected > span d:grid
		.empty mih:150px d:grid jai:center ac:center g:6px p:24px rd:12px bgc:var(--outpost-soft) c:var(--outpost-muted) ta:center
		.empty outpost-icon fs:24px c:#8DA0BC
		.empty strong fs:13px c:var(--outpost-text)
		.empty span fs:11px
		&.compact .filters p:12px
		&.compact .picker-layout d:grid gtc:250px minmax(0,1fr) ai:stretch g:14px
		&.compact .results pos:relative; min-height:0
		&.compact .filter-row gtc:1fr g:5px
		&.compact .filter-row > strong pt:0
		&.compact .chips g:5px
		&.compact .chips button h:28px px:9px fs:10px
		&.compact .results-head mt:0
		&.compact .results-head span d:none
		&.compact .avatar-grid pos:absolute t:24px r:0 b:0 l:0 h:auto mih:0 mah:none gtc:repeat(6,54px) gar:54px jc:start g:10px
		&.compact .avatar-grid button, &.compact .avatar-grid img s:54px
		@media(max-width: 800px)
			.avatar-grid gtc:repeat(auto-fill, 54px) gar:54px g:10px
			.avatar-grid button, .avatar-grid img s:54px
		@media(max-width: 620px)
			&.compact .picker-layout gtc:1fr
			&.compact .results pos:static
			&.compact .avatar-grid pos:static h:auto mah:244px gtc:repeat(auto-fill,54px)
			.filter-row gtc:1fr g:5px
			.filter-row > strong pt:0
			.results-head span d:none
			.avatar-grid gtc:repeat(auto-fill, 54px) gar:54px g:10px
			.avatar-grid button, .avatar-grid img s:54px
