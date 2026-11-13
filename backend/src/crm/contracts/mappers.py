from .domain.entities import Contract
from .schemas import ContractRateOut, ContractResponse


def map_contract_to_response(contract: Contract) -> ContractResponse:
    return ContractResponse(
        id=contract.id,
        counterparty_id=contract.counterparty_id,
        name=contract.name,
        date_start=contract.date_start,
        date_end=contract.date_end,
        status=contract.status,
        type=contract.type,
        period=contract.period,
        sum=contract.sum,
        rates=[
            ContractRateOut(
                id=rate.id,
                type_rate=rate.type_rate,
                rate=rate.rate,
                unit_measurement_rate=rate.unit_measurement_rate,
                hours_subscription=rate.hours_subscription,
                hours_its=rate.hours_its,
                created_at=rate.created_at,
                updated_at=rate.updated_at,
            )
            for rate in contract.rates
        ],
        created_at=contract.created_at,
        updated_at=contract.updated_at,
    )