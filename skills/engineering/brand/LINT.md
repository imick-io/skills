# The lint guard

A page that skips the design system does it in a fixed pattern, so a linter catches it and no reviewer has to. The Design system epic adds this **guard** to the project's own linter and runs it in the CI job that already lints.

It fails on, everywhere outside the shared components' folder:

- **a raw element where a shared component exists**: `<button>`, `<input>`, `<select>`, `<textarea>`, `<table>`, `<h1>` to `<h6>`, `<dialog>`,
- **a colour literal**: hex, `rgb()`, `hsl()` or `oklch()` in a page or a feature's styles,
- **an arbitrary value** in a utility class: `text-[13px]`, `bg-[#2238c4]`, `p-[7px]`.

For ESLint (flat config) and JSX, adapt the globs and the list to the components the project has:

```js
{
  files: ["apps/*/src/**/*.{ts,tsx}"],
  ignores: ["**/components/ui/**", "**/*.test.*"],
  rules: {
    "no-restricted-syntax": ["error",
      { selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea|table|dialog|h[1-6])$/]", message: "Use the shared component (see DESIGN.md): a raw element skips the design system." },
      { selector: ":matches(Literal[value=/(#[0-9a-fA-F]{3,8}\\b|\\b(rgb|hsl|oklch)a?\\()/], TemplateElement[value.raw=/(#[0-9a-fA-F]{3,8}\\b|\\b(rgb|hsl|oklch)a?\\()/])", message: "Use a colour token from DESIGN.md." },
      { selector: "JSXAttribute[name.name='className'] :matches(Literal[value=/-\\[[^\\]]+\\]/], TemplateElement[value.raw=/-\\[[^\\]]+\\]/])", message: "Use the spacing, type and colour scale: no arbitrary values." },
    ],
  },
}
```

On another stack, write the same three rules in its linter: for React Native, `no-restricted-imports` on `Text`, `Pressable` and `TextInput` from `react-native` outside the shared components; for CSS, Stylelint's `color-no-hex` and `declaration-property-value-disallowed-list`.

On a codebase that already has screens, turn the guard on for the folders that pass and cut one ticket per folder that doesn't; the epic is done when it covers every page.
