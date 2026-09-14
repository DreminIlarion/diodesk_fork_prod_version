import pytest
from pydantic import ValidationError

from src.products.domain.vo import ProductCategory, ProductStatus
from src.products.schemas import ProductCreate


def make_product(**overrides) -> ProductCreate:
    data = {
        "name": "1С УНФ",
        "vendor": "1С",
        "category": ProductCategory.ERP,
        "status": ProductStatus.ACTIVE,
    }
    data.update(overrides)
    return ProductCreate(**data)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("name", ""),
        ("name", "  "),
        ("vendor", ""),
        ("vendor", "   "),
        ("article", ""),
        ("article", "   "),
    ]
)
def test_product_string_fields_cannot_be_empty(field, value):
    with pytest.raises(ValidationError):
        make_product(**{field: value})


@pytest.mark.parametrize("article", [None, "11913728"])
def test_article_accepts_none_or_non_empty_string(article):
    product = make_product(article=article)

    assert product.article == article


def test_product_string_fields_are_trimmed():
    product = make_product(
        name="  1С УНФ  ",
        vendor="  1С  ",
        article="  11913728  ",
    )

    assert product.name == "1С УНФ"
    assert product.vendor == "1С"
    assert product.article == "11913728"
