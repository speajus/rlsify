import { DropdownMenu as DropdownMenuPrimitive } from 'bits-ui';
import Content from './dropdown-menu-content.svelte';
import Item from './dropdown-menu-item.svelte';
import Separator from './dropdown-menu-separator.svelte';

const Root = DropdownMenuPrimitive.Root;
const Trigger = DropdownMenuPrimitive.Trigger;
const Group = DropdownMenuPrimitive.Group;

export {
  Root,
  Content,
  Item,
  Trigger,
  Group,
  Separator,
  Root as DropdownMenu,
  Content as DropdownMenuContent,
  Item as DropdownMenuItem,
  Trigger as DropdownMenuTrigger,
  Group as DropdownMenuGroup,
  Separator as DropdownMenuSeparator,
};

