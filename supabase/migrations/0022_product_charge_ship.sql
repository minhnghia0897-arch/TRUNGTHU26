-- Phí ship tính THEO SẢN PHẨM, không phải theo kho.
--
-- Thực tế của shop: mọi set đều miễn phí ship ở cả hai chiều VN và Hàn, riêng
-- một set có thu phí ship bên Hàn. Trước đây phí ship là thuộc tính của KHO nên
-- không diễn tả được chuyện đó — bật phí là mọi món đều bị thu.
--
-- Mặc định `false` (miễn ship) vì đó là nếp chung của shop. Món nào thu phí thì
-- tích ô trong Dashboard → Sản phẩm.
alter table box    add column if not exists charge_ship boolean not null default false;
alter table combo  add column if not exists charge_ship boolean not null default false;
alter table flavor add column if not exists charge_ship boolean not null default false;

comment on column combo.charge_ship is
  'Món này có thu phí ship riêng không. false = giá đã gồm ship. Kiện nào chứa ít nhất một món true thì thu phí ship của kho một lần; kiện toàn món false thì không thu.';
comment on column box.charge_ship    is 'Xem combo.charge_ship.';
comment on column flavor.charge_ship is 'Xem combo.charge_ship.';
