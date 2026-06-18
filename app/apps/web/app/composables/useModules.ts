/**
 * Bridges the @modulecad/modules engine to the live AcDbDatabase held by the
 * vendored viewer.
 *
 * Plotting happens client-side: the browser owns the parsed AcDbDatabase (the
 * viewer loaded the DXF into it), so the engine runs here. After generating
 * layouts we re-render the viewer and can switch to any generated layout via
 * the layout manager.
 */
import { AcApDocManager } from '@mlightcad/cad-simple-viewer'
import {
  generateModuleLayout,
  type ModuleInstance,
  type ModuleTemplate,
  type GeneratedLayout
} from '@modulecad/modules'

export function useModules() {
  /**
   * Generate (or regenerate) the paper-space AcDbLayout for a single module.
   * Requires the viewer to be initialised (AcApDocManager.instance.curDocument
   * must exist).
   */
  function plotModule(
    module: ModuleInstance,
    template: ModuleTemplate
  ): GeneratedLayout {
    const doc = AcApDocManager.instance.curDocument
    if (!doc?.database) {
      throw new Error('Viewer not ready — no AcDbDatabase available')
    }
    return generateModuleLayout(doc.database, module, template)
  }

  /**
   * Generate layouts for every module in sort order.
   */
  function plotAll(
    modules: ModuleInstance[],
    templatesById: Map<string, ModuleTemplate>
  ): GeneratedLayout[] {
    const doc = AcApDocManager.instance.curDocument
    if (!doc?.database) {
      throw new Error('Viewer not ready — no AcDbDatabase available')
    }
    // Import the bulk helper lazily to keep the initial bundle smaller.
    return modules
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((m) => {
        const tpl = templatesById.get(m.templateId)
        if (!tpl) throw new Error(`No template for module ${m.name}`)
        return generateModuleLayout(doc.database, m, tpl)
      })
  }

  /** Switch the viewer to display a given layout by name. */
  async function showLayout(name: string) {
    await AcApDocManager.instance.setCurrentLayoutByName?.(name)
    // Fallback: the layout manager singleton also accepts a name.
    if (!AcApDocManager.instance.setCurrentLayoutByName) {
      const { acdbHostApplicationServices } = await import('@mlightcad/data-model')
      acdbHostApplicationServices().layoutManager.setCurrentLayout(name)
    }
  }

  return { plotModule, plotAll, showLayout }
}
