# Thêm Tính Năng "Ngữ Pháp Sau Từ" vào Web Học Từ Vựng

## Mô Tả

Thêm trường **`grammarPattern`** vào mỗi từ vựng để lưu cú pháp ngữ pháp đi kèm (collocation/grammar pattern). Ví dụ:
- **persist** (verb) → `persist in / with + V-ing`
- **encourage** (verb) → `encourage sb to do sth`
- **difficulty** (noun) → `have difficulty (in) + V-ing`
- **different** (adjective) → `different from sth`
- **eventually** (adverb) → `[used at beginning or end of sentence]`

Tính năng này sẽ hiển thị ở:
1. **Thẻ từ vựng (Vocab Card)** — hiện thị ở dưới ví dụ minh họa
2. **Flashcard (mặt sau)** — hiện thị phần ngữ pháp sau định nghĩa
3. **Bảng tổng hợp tất cả từ vựng** — thêm cột "Ngữ pháp"
4. **Form thêm/sửa từ** — thêm ô nhập liệu `grammarPattern`

---

## Open Questions

> [!IMPORTANT]
> **Dữ liệu mặc định**: Với 3000+ từ vựng hiện có, việc thêm `grammarPattern` thủ công cho từng từ là bất khả thi. Giải pháp đề xuất: **chỉ thêm grammarPattern cho ~30–40 từ tiêu biểu** (chủ yếu là các từ có cú pháp đặc biệt như verb + to-inf, verb + V-ing, adj + preposition, v.v.). Người dùng có thể tự thêm vào form sửa từ.

> [!NOTE]
> **Không bắt buộc**: Trường `grammarPattern` là tùy chọn — nếu trống thì không hiển thị UI.

---

## Proposed Changes

### Phần 1: Data Schema (data.js)

#### [MODIFY] [data.js](file:///d:/PROGRAM/Dự án web/Web học từ vựng/js/data.js)
Thêm trường `grammarPattern` vào ~35 từ vựng tiêu biểu trong `DEFAULT_VOCABULARY`, ưu tiên:
- Các động từ có cú pháp đặc trưng: `persist`, `encourage`, `employ`, `eliminate`, `discover`, `raise`, `drive`, `earn`, `drop`, `embarrass`
- Danh từ có cú pháp giới từ: `difficulty`, `direction`, `duty`, `effort`, `economy`, `effect`, `education`
- Tính từ có cú pháp giới từ: `different`, `difficult`, `direct`, `effective`, `elderly`
- Trạng từ: `eventually`

Ví dụ format:
```js
{
  id: "vocab-3",
  word: "persist",
  ...
  grammarPattern: "persist in/with + V-ing"
}
```

---

### Phần 2: App Logic (app.js)

#### [MODIFY] [app.js](file:///d:/PROGRAM/Dự án web/Web học từ vựng/js/app.js)

**2a. renderVocabularyList()** (dòng ~622–699): Thêm hiển thị `grammarPattern` vào vocab card HTML (sau `vocab-example-box`):
```html
<div class="vocab-grammar-pattern">
  <i class="fa-solid fa-diagram-project"></i>
  <span>persist in/with + V-ing</span>
</div>
```

**2b. renderFlashcard()** (dòng ~1456–1506): Thêm hiển thị `grammarPattern` ở mặt sau flashcard (sau example-box):
```html
<div class="flash-grammar-pattern" id="flash-grammar-pattern">...</div>
```

**2c. renderAllVocabTable()** (dòng ~1080–1210): Thêm cột "Ngữ pháp sau từ" vào bảng.

**2d. startEditVocab()** (dòng ~888): Load `grammarPattern` vào form khi sửa.

**2e. Form submit handler** (dòng ~780–885): Lưu `grammarPattern` khi sửa từ.

**2f. saveNewVocab()** (dòng ~937): Lưu `grammarPattern` khi thêm từ mới.

---

### Phần 3: HTML (index.html)

#### [MODIFY] [index.html](file:///d:/PROGRAM/Dự án web/Web học từ vựng/index.html)

**3a. Form thêm/sửa từ** (dòng ~277–336): Thêm trường input `vocab-grammar-pattern` trong phần `vocab-adv-fields-row`:
```html
<div class="form-group" id="vocab-adv-fields-grammar">
  <label for="vocab-grammar-pattern">
    <i class="fa-solid fa-diagram-project"></i> Cú pháp ngữ pháp sau từ
  </label>
  <input type="text" id="vocab-grammar-pattern" 
    placeholder="Ví dụ: persist in/with + V-ing">
</div>
```

**3b. Bảng tổng hợp từ vựng** (dòng ~463–477): Thêm header `<th>Ngữ pháp sau từ</th>`.

**3c. Flashcard mặt sau** (dòng ~534–542): Thêm `<div id="flash-grammar-pattern">` ở mặt sau card.

---

### Phần 4: CSS (style.css)

#### [MODIFY] [style.css](file:///d:/PROGRAM/Dự án web/Web học từ vựng/css/style.css)
Thêm styles cho:
- `.vocab-grammar-pattern` — hiển thị trong vocab card
- `.flash-grammar-pattern` — hiển thị trong flashcard
- Style badge với màu tím/cam đặc trưng để dễ nhận biết

---

## Verification Plan

### Manual Verification
1. Mở trang web → vào **Kho từ vựng** → thấy badge ngữ pháp dưới ví dụ của các từ có pattern
2. Click **Ôn tập Flashcards** → lật thẻ → thấy phần ngữ pháp ở mặt sau
3. Vào **Tổng hợp tất cả từ vựng** → thấy cột "Ngữ pháp"
4. Sửa một từ → thấy ô nhập grammarPattern → nhập và lưu → kiểm tra hiển thị
5. Thêm từ mới → thấy ô nhập → kiểm tra lưu đúng
