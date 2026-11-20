"""Load the two disjoint parts of the official Mesorch-P checkpoint."""
import torch
from timm.models.convnext import ConvNeXt


class PublishedGraph(torch.nn.Module):
    def __init__(self, predictor, retained):
        super().__init__()
        self.predictor = predictor
        self.retained = retained

    def forward(self, image, mask):
        return self.predictor(image, mask)


def strict_copy(module, tensors):
    template = module.state_dict()
    if template.keys() != tensors.keys():
        raise ValueError("Checkpoint and expected tensor names differ")
    for name, target in template.items():
        source = tensors[name]
        if target.shape != source.shape or target.dtype != source.dtype:
            raise ValueError(f"Shape or dtype mismatch at {name}")
    module.load_state_dict(tensors, strict=True)
    for name, target in module.state_dict().items():
        if not torch.equal(target, tensors[name]):
            raise ValueError(f"Tensor value mismatch after loading {name}")


def load_complete(factory, tensors, audited):
    predictor = factory()
    active = set(predictor.state_dict())
    backbone = ConvNeXt(depths=(3, 3, 9, 3), dims=(96, 192, 384, 768))
    retained = torch.nn.Module()
    retained.convnext = torch.nn.Module()
    retained.convnext.stages = torch.nn.ModuleDict({"3": backbone.stages[3]})
    retained.convnext.head = backbone.head
    del backbone
    extra = set(retained.state_dict())
    if extra != audited or len(extra) != 35 or active & extra or active | extra != set(tensors):
        raise ValueError("Incomplete or ambiguous checkpoint partition")
    strict_copy(retained, {name: tensors[name] for name in extra})
    strict_copy(predictor, {name: tensors[name] for name in active})
    reference = factory()
    reference.load_state_dict({name: tensors[name] for name in reference.state_dict()}, strict=True)
    return PublishedGraph(predictor, retained), reference, len(active)
