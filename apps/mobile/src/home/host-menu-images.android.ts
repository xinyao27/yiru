import deleteIcon from '@expo/material-symbols/delete.xml'
import editIcon from '@expo/material-symbols/edit.xml'
import powerIcon from '@expo/material-symbols/power_settings_new.xml'
import reconnectIcon from '@expo/material-symbols/sync.xml'
import type { MenuAction } from '@expo/ui/community/menu'

export const HOST_RECONNECT_IMAGE: MenuAction['image'] = reconnectIcon
export const HOST_DISCONNECT_IMAGE: MenuAction['image'] = powerIcon
export const HOST_EDIT_IMAGE: MenuAction['image'] = editIcon
export const HOST_REMOVE_IMAGE: MenuAction['image'] = deleteIcon
