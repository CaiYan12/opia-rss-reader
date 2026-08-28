import { makeJuyaTemplate } from './base'

/** 90 年代报刊式：锚定真实 90 年代中文报刊语言——报头（刊头+日期线）、栏目栏、
 *  宽窗口正文两栏、宋体系衬线。非现代 broadsheet hairline 模板。 */
export const newsprint90sTemplate = makeJuyaTemplate({
  variantClass: 'jynews',
  entryColumns: true,
  mastheadExtra: (pubDate) => (
    <div className="juya-date-line">
      {new Date(pubDate).toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long'
      })}
    </div>
  )
})
