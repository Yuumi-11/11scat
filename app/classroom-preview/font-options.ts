export const calendarFontOptions = [
  { id:'pen', name:'霞鹜文楷', font:'"School Calendar Pen", cursive', note:'硬笔楷书，日常小字较清楚。' },
  { id:'brush', name:'马善政毛笔楷书', font:'"School Calendar Brush", "School Calendar Pen", cursive', note:'厚实的毛笔楷书，笔画对比较明显。' },
  { id:'yan', name:'辰宇落雁体', font:'"Classroom Yan", "Long Cang", cursive', note:'纤细的随手书写感，缺少的简体字由龙藏体补充。' },
  { id:'running', name:'志莽行书', font:'"School Running", "School Calendar Pen", cursive', note:'流动的行书，连笔感比楷书更明显。' },
  { id:'cursive', name:'刘建毛草', font:'"School Cursive", "School Calendar Pen", cursive', note:'变化较大的草书，小字阅读会更费力。' },
  { id:'rounded', name:'站酷快乐体', font:'"School Rounded", "School Calendar Pen", cursive', note:'圆润、活泼的手绘字形，和细笔书写形成对照。' },
  { id:'long', name:'龙藏体', font:'"Long Cang", cursive', note:'较松散的毛笔书写，沿用已有字体素材。' },
] as const;
export const calendarTitleOptions = [
  {id:'chalk',name:'CHAWP 粉笔字',font:'"CHAWP", sans-serif'},
  {id:'caveat',name:'Caveat',font:'"School Caveat", sans-serif'},
  {id:'patrick',name:'Patrick Hand',font:'"School Patrick", sans-serif'},
] as const;
export type CalendarFontId = typeof calendarFontOptions[number]['id'];
export type CalendarTitleId = typeof calendarTitleOptions[number]['id'];
