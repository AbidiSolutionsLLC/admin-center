// render-test.mjs - Test if DataFieldsPage and its children can be rendered
import React from 'react';
import { createRoot } from 'react-dom/client';

console.log('=== Testing component imports ===');

// Test 1: Check if @radix-ui/react-tabs works
try {
  const Tabs = await import('@radix-ui/react-tabs');
  console.log('Tabs.Root:', typeof Tabs.Root);
  console.log('Tabs.List:', typeof Tabs.List);
  console.log('Tabs.Trigger:', typeof Tabs.Trigger);
  console.log('Tabs.Content:', typeof Tabs.Content);
} catch (e) {
  console.log('ERROR importing Tabs:', e.message);
}

// Test 2: Check if @radix-ui/react-dialog works
try {
  const Dialog = await import('@radix-ui/react-dialog');
  console.log('Dialog.Root:', typeof Dialog.Root);
  console.log('Dialog.Portal:', typeof Dialog.Portal);
  console.log('Dialog.Overlay:', typeof Dialog.Overlay);
  console.log('Dialog.Content:', typeof Dialog.Content);
} catch (e) {
  console.log('ERROR importing Dialog:', e.message);
}

// Test 3: Check if react-hook-form and zod work together
try {
  const { useForm } = await import('react-hook-form');
  const { zodResolver } = await import('@hookform/resolvers/zod');
  const { z } = await import('zod');
  console.log('useForm:', typeof useForm);
  console.log('zodResolver:', typeof zodResolver);
  console.log('z:', typeof z);
  
  // Test schema creation
  const schema = z.object({
    name: z.string().min(1),
    field_type: z.enum(['text', 'number', 'date', 'boolean', 'select', 'multi_select', 'url', 'email', 'phone']),
    target_object: z.enum(['user', 'department', 'policy']),
    label: z.string().min(1),
    default_value: z.string().optional().nullable(),
  });
  console.log('Schema created successfully');
  console.log('Schema safeParse test:', schema.safeParse({ name: 'test', field_type: 'date', target_object: 'user', label: 'Test' }).success);
} catch (e) {
  console.log('ERROR with hooks/form:', e.message);
}

// Test 4: Check if the Tailwind classes are valid
try {
  const { clsx } = await import('clsx');
  const { twMerge } = await import('tailwind-merge');
  const cn = (...inputs) => twMerge(clsx(inputs));
  
  const className = cn(
    'flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded transition-colors',
    'data-[state=active]:bg-primary data-[state=active]:text-white',
    'data-[state=inactive]:text-ink-secondary hover:text-ink'
  );
  console.log('Tabs.Trigger className generated:', className.length > 0);
  
  const buttonClassName = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium',
    'bg-primary hover:bg-primary-hover text-white'
  );
  console.log('Button className generated:', buttonClassName.length > 0);
} catch (e) {
  console.log('ERROR with class generation:', e.message);
}

console.log('\n=== All import tests complete ===');
